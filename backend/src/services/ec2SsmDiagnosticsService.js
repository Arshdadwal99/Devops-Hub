import {
  DescribeInstancesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  DescribeInstanceInformationCommand,
  ListCommandsCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  GetInstanceProfileCommand,
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import { awsProviderService } from "./awsProviderService.js";
import { logger } from "../utils/logger.js";

class Ec2SsmDiagnosticsService {
  /**
   * Comprehensive diagnostics for SSM connectivity issues
   * Checks:
   * 1. EC2 instance exists and is running
   * 2. IAM role is attached and has correct policies
   * 3. SSM Agent is running on the instance
   * 4. Instance is registered in Systems Manager
   * 5. Instance has SSM permissions
   */
  async runComprehensiveDiagnostics(userId, awsConnection, instanceId) {
    logger.info("[SSM-DIAG] Starting comprehensive diagnostics", { instanceId, region: awsConnection.region });
    
    const diagnostics = {
      instanceId,
      region: awsConnection.region,
      timestamp: new Date().toISOString(),
      checks: {},
      recommendations: [],
    };

    try {
      // Check 1: Verify EC2 instance exists and get details
      diagnostics.checks.ec2Instance = await this.checkEc2Instance(userId, awsConnection, instanceId);
      
      // Check 2: Verify IAM role and policies
      diagnostics.checks.iamRole = await this.checkIamRoleAndPolicies(userId, awsConnection, instanceId);
      
      // Check 3: Check SSM registration status
      diagnostics.checks.ssmRegistration = await this.checkSsmRegistration(userId, awsConnection, instanceId);
      
      // Check 4: Verify SSM Agent on instance
      diagnostics.checks.ssmAgent = await this.checkSsmAgent(userId, awsConnection, instanceId);
      
      // Generate recommendations
      diagnostics.recommendations = this.generateRecommendations(diagnostics.checks);
      
      logger.info("[SSM-DIAG] Diagnostics complete", {
        instanceId,
        ec2Status: diagnostics.checks.ec2Instance?.status,
        iamStatus: diagnostics.checks.iamRole?.status,
        ssmStatus: diagnostics.checks.ssmRegistration?.status,
        recommendations: diagnostics.recommendations.length,
      });

      return diagnostics;
    } catch (error) {
      logger.error("[SSM-DIAG] Diagnostics failed", { instanceId, error: error.message });
      diagnostics.error = error.message;
      return diagnostics;
    }
  }

  /**
   * Check 1: EC2 Instance Details
   */
  async checkEc2Instance(userId, awsConnection, instanceId) {
    try {
      const ec2ClientResult = await awsProviderService.getEC2Client(
        userId,
        awsConnection.encryptedCredentials,
        awsConnection.region
      );
      const ec2Client = ec2ClientResult.client;

      const response = await ec2Client.send(new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      }));

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        return {
          status: "FAILED",
          message: "Instance not found",
          details: null,
        };
      }

      const iamInstanceProfile = instance.IamInstanceProfile?.Arn || "NOT_ATTACHED";
      const check = {
        status: instance.State.Name === "running" ? "OK" : "WARNING",
        message: `Instance is ${instance.State.Name}`,
        details: {
          instanceId,
          state: instance.State.Name,
          instanceType: instance.InstanceType,
          launchTime: instance.LaunchTime,
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
          vpcId: instance.VpcId,
          subnetId: instance.SubnetId,
          securityGroups: instance.SecurityGroups?.map(sg => sg.GroupId) || [],
          iamInstanceProfile,
          platform: instance.Platform || "Linux",
          tags: instance.Tags || [],
        },
      };

      if (!iamInstanceProfile || iamInstanceProfile === "NOT_ATTACHED") {
        check.status = "FAILED";
        check.message = "No IAM instance profile attached";
      }

      return check;
    } catch (error) {
      return {
        status: "ERROR",
        message: `Failed to check EC2 instance: ${error.message}`,
        error: error.name,
      };
    }
  }

  /**
   * Check 2: IAM Role and Policies
   */
  async checkIamRoleAndPolicies(userId, awsConnection, instanceId) {
    try {
      const ec2ClientResult = await awsProviderService.getEC2Client(
        userId,
        awsConnection.encryptedCredentials,
        awsConnection.region
      );
      const ec2Client = ec2ClientResult.client;

      // Get instance IAM profile
      const ec2Response = await ec2Client.send(new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      }));

      const iamProfileArn = ec2Response.Reservations?.[0]?.Instances?.[0]?.IamInstanceProfile?.Arn;
      if (!iamProfileArn) {
        return {
          status: "FAILED",
          message: "No IAM instance profile attached to instance",
          details: null,
        };
      }

      const profileName = iamProfileArn.split("/").pop();
      const check = {
        status: "CHECKING",
        details: {
          iamProfileName: profileName,
          iamProfileArn,
          roles: [],
          policies: [],
        },
      };

      try {
        const iamClient = new IAMClient({
          region: awsConnection.region,
          credentials: (await awsProviderService.getEC2Client(
            userId,
            awsConnection.encryptedCredentials,
            awsConnection.region
          )).credentials,
        });

        const profileResponse = await iamClient.send(new GetInstanceProfileCommand({
          InstanceProfileName: profileName,
        }));

        const roles = profileResponse.InstanceProfile?.Roles || [];
        check.details.roles = roles.map(r => ({
          roleName: r.RoleName,
          arn: r.Arn,
          createDate: r.CreateDate,
        }));

        // Check policies for each role
        for (const role of roles) {
          const policiesResponse = await iamClient.send(new ListAttachedRolePoliciesCommand({
            RoleName: role.RoleName,
          }));

          const policies = policiesResponse.AttachedPolicies || [];
          check.details.policies.push({
            roleName: role.RoleName,
            attachedPolicies: policies.map(p => ({
              policyName: p.PolicyName,
              policyArn: p.PolicyArn,
            })),
          });

          // Check for SSM policy
          const hasSSMPolicy = policies.some(
            p => p.PolicyArn === "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
          );

          if (!hasSSMPolicy) {
            check.status = "WARNING";
            check.message = `Role ${role.RoleName} missing AmazonSSMManagedInstanceCore policy`;
          }
        }

        if (check.status !== "WARNING") {
          check.status = roles.length > 0 ? "OK" : "FAILED";
          if (roles.length === 0) {
            check.message = "No roles attached to instance profile";
          }
        }
      } catch (iamError) {
        check.status = "ERROR";
        check.message = `Failed to check IAM: ${iamError.message}`;
      }

      return check;
    } catch (error) {
      return {
        status: "ERROR",
        message: `Failed to check IAM role: ${error.message}`,
        error: error.name,
      };
    }
  }

  /**
   * Check 3: SSM Registration Status
   */
  async checkSsmRegistration(userId, awsConnection, instanceId) {
    try {
      const ssmClient = await this.getSsmClient(userId, awsConnection);

      try {
        const response = await ssmClient.send(new DescribeInstanceInformationCommand({
          InstanceInformationFilterList: [
            {
              key: "InstanceIds",
              valueSet: [instanceId],
            },
          ],
        }));

        const instanceInfo = response.InstanceInformationList?.[0];
        if (!instanceInfo) {
          return {
            status: "FAILED",
            message: "Instance not found in SSM Managed Nodes",
            details: {
              registeredInstances: response.InstanceInformationList?.length || 0,
            },
          };
        }

        const check = {
          status: instanceInfo.PingStatus === "Online" ? "OK" : "WARNING",
          message: `SSM Agent status: ${instanceInfo.PingStatus}`,
          details: {
            instanceId: instanceInfo.InstanceId,
            pingStatus: instanceInfo.PingStatus,
            lastPingDateTime: instanceInfo.LastPingDateTime,
            agentVersion: instanceInfo.AgentVersion,
            platformType: instanceInfo.PlatformType,
            platformName: instanceInfo.PlatformName,
            computerName: instanceInfo.ComputerName,
            ipAddress: instanceInfo.IPAddress,
            resourceType: instanceInfo.ResourceType,
            associationStatus: instanceInfo.AssociationStatus,
          },
        };

        if (instanceInfo.PingStatus !== "Online") {
          check.message = `SSM Agent is ${instanceInfo.PingStatus}. Last ping: ${instanceInfo.LastPingDateTime || "Never"}`;
        }

        return check;
      } catch (ssmError) {
        if (ssmError.name === "InvalidInstanceId") {
          return {
            status: "FAILED",
            message: "Instance not registered in SSM",
            details: { error: ssmError.message },
          };
        }
        throw ssmError;
      }
    } catch (error) {
      return {
        status: "ERROR",
        message: `Failed to check SSM registration: ${error.message}`,
        error: error.name,
      };
    }
  }

  /**
   * Check 4: SSM Agent Status
   */
  async checkSsmAgent(userId, awsConnection, instanceId) {
    try {
      const ssmClient = await this.getSsmClient(userId, awsConnection);

      const response = await ssmClient.send(new ListCommandsCommand({
        InstanceIds: [instanceId],
        MaxResults: 5,
      }));

      const commands = response.Commands || [];
      const check = {
        status: commands.length > 0 ? "OK" : "INFO",
        message: commands.length > 0 
          ? `Found ${commands.length} SSM command(s)` 
          : "No SSM commands executed yet on this instance",
        details: {
          totalCommands: commands.length,
          recentCommands: commands.slice(0, 3).map(cmd => ({
            commandId: cmd.CommandId,
            documentName: cmd.DocumentName,
            status: cmd.Status,
            issuedTime: cmd.IssuedTime,
          })),
        },
      };

      return check;
    } catch (error) {
      return {
        status: "WARNING",
        message: `Could not retrieve SSM command history: ${error.message}`,
        error: error.name,
      };
    }
  }

  /**
   * Generate recommendations based on diagnostics
   */
  generateRecommendations(checks) {
    const recommendations = [];

    // EC2 instance checks
    if (checks.ec2Instance?.status === "FAILED") {
      recommendations.push({
        priority: "CRITICAL",
        check: "ec2Instance",
        message: "EC2 instance not found. Verify instance ID is correct.",
      });
    } else if (checks.ec2Instance?.status === "WARNING") {
      recommendations.push({
        priority: "HIGH",
        check: "ec2Instance",
        message: `EC2 instance is not running. Current state: ${checks.ec2Instance?.details?.state}. Start the instance first.`,
      });
    }

    // IAM role checks
    if (checks.iamRole?.status === "FAILED") {
      recommendations.push({
        priority: "CRITICAL",
        check: "iamRole",
        message: "No IAM instance profile attached. The instance needs an IAM role with AmazonSSMManagedInstanceCore policy.",
      });
    } else if (checks.iamRole?.status === "WARNING") {
      recommendations.push({
        priority: "HIGH",
        check: "iamRole",
        message: "IAM role missing AmazonSSMManagedInstanceCore policy. Attach this managed policy to enable SSM.",
      });
    } else if (checks.iamRole?.status === "ERROR") {
      recommendations.push({
        priority: "HIGH",
        check: "iamRole",
        message: `Error checking IAM: ${checks.iamRole?.message}`,
      });
    }

    // SSM registration checks
    if (checks.ssmRegistration?.status === "FAILED") {
      recommendations.push({
        priority: "CRITICAL",
        check: "ssmRegistration",
        message: "Instance not registered in SSM Managed Nodes. Ensure SSM Agent is installed and running on the instance. This can take 2-5 minutes after instance launch.",
      });
    } else if (checks.ssmRegistration?.status === "WARNING") {
      recommendations.push({
        priority: "HIGH",
        check: "ssmRegistration",
        message: `SSM Agent is not online. Status: ${checks.ssmRegistration?.details?.pingStatus}. Last ping: ${checks.ssmRegistration?.details?.lastPingDateTime || "Never"}. Wait for SSM Agent to come online.`,
      });
    }

    // SSM agent checks
    if (checks.ssmAgent?.status === "ERROR") {
      recommendations.push({
        priority: "MEDIUM",
        check: "ssmAgent",
        message: checks.ssmAgent?.message,
      });
    }

    return recommendations;
  }

  async getSsmClient(userId, awsConnection) {
    const ec2ClientResult = await awsProviderService.getEC2Client(
      userId,
      awsConnection.encryptedCredentials,
      awsConnection.region
    );

    return new SSMClient({
      region: ec2ClientResult.region || awsConnection.region,
      credentials: ec2ClientResult.credentials,
    });
  }

  /**
   * Wait for instance to appear in AWS Systems Manager Managed Nodes
   * with 5-minute timeout
   */
  async waitForSsmRegistration(userId, awsConnection, instanceId, options = {}) {
    const timeoutMs = options.timeoutMs || 5 * 60 * 1000; // 5 minutes
    const pollIntervalMs = options.pollIntervalMs || 10000; // 10 seconds
    const startedAt = Date.now();
    let pollCount = 0;

    logger.info("[SSM-REG] Waiting for instance to register in SSM Managed Nodes", {
      instanceId,
      region: awsConnection.region,
      timeoutMs,
      pollIntervalMs,
    });

    while (Date.now() - startedAt < timeoutMs) {
      pollCount++;
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      try {
        logger.debug("[SSM-REG] Poll attempt for SSM registration", {
          instanceId,
          attempt: pollCount,
          elapsedSeconds,
        });

        const ssmClient = await this.getSsmClient(userId, awsConnection);
        const response = await ssmClient.send(new DescribeInstanceInformationCommand({
          InstanceInformationFilterList: [
            {
              key: "InstanceIds",
              valueSet: [instanceId],
            },
          ],
        }));

        const instanceInfo = response.InstanceInformationList?.[0];
        if (!instanceInfo) {
          logger.debug("[SSM-REG] Instance not yet registered in SSM", {
            instanceId,
            elapsedSeconds,
          });
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          continue;
        }

        // Instance found in SSM
        logger.info("[SSM-REG] Instance registered in SSM Managed Nodes", {
          instanceId,
          pingStatus: instanceInfo.PingStatus,
          agentVersion: instanceInfo.AgentVersion,
          platformType: instanceInfo.PlatformType,
          computerName: instanceInfo.ComputerName,
          pollCount,
          elapsedSeconds,
        });

        // If status is Online, we're good to go
        if (instanceInfo.PingStatus === "Online") {
          logger.info("[SSM-REG] Instance is online and ready for commands", {
            instanceId,
            pollCount,
            elapsedSeconds,
          });
          return {
            registered: true,
            instanceId,
            pingStatus: instanceInfo.PingStatus,
            agentVersion: instanceInfo.AgentVersion,
            elapsedSeconds,
          };
        }

        // If Offline, it's registered but not responding yet - keep waiting
        logger.debug("[SSM-REG] Instance registered but ping status is " + instanceInfo.PingStatus, {
          instanceId,
          pingStatus: instanceInfo.PingStatus,
          lastPingDateTime: instanceInfo.LastPingDateTime,
        });

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        if (error.name === "InvalidInstanceId") {
          logger.debug("[SSM-REG] Instance not yet in SSM database", {
            instanceId,
            elapsedSeconds,
            error: error.message,
          });
        } else {
          logger.warn("[SSM-REG] Error checking SSM registration", {
            instanceId,
            elapsedSeconds,
            error: error.message,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    // Timeout reached
    logger.error("[SSM-REG] Timeout waiting for instance to register in SSM", {
      instanceId,
      timeoutMs,
      pollCount,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    });

    throw new Error(
      `EC2 instance launched successfully but failed to register with AWS Systems Manager within ${Math.round(timeoutMs / 1000)} seconds. ` +
      `Instance: ${instanceId}. The SSM Agent may not be installed or there may be a network/IAM configuration issue.`
    );
  }
}

export const ec2SsmDiagnosticsService = new Ec2SsmDiagnosticsService();
