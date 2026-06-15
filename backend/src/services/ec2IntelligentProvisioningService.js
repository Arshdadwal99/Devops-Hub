/**
 * EC2 Intelligent Provisioning Service
 * 
 * Handles intelligent EC2 instance management:
 * 1. Discover existing EC2 instances
 * 2. Check which are DevOpsHub-managed
 * 3. Reuse suitable instances
 * 4. Create new instances if needed
 * 5. Free-tier aware provisioning
 * 6. Intelligent sizing based on repository size
 * 7. Automatic security group creation
 * 8. Proper tagging of all resources
 */

import {
  DescribeInstancesCommand,
  RunInstancesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  AllocateAddressCommand,
  AssociateAddressCommand,
  CreateTagsCommand,
  DescribeVpcsCommand,
  DescribeSecurityGroupsCommand,
} from "@aws-sdk/client-ec2";
import {
  AddRoleToInstanceProfileCommand,
  AttachRolePolicyCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  GetInstanceProfileCommand,
  GetRoleCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import { awsProviderService } from "./awsProviderService.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { logger } from "../utils/logger.js";
import {
  FREE_TIER_INSTANCE_TYPES,
  INSTANCE_TYPE,
  getAwsErrorResponse,
  getConfiguredInstanceType,
  logEC2Launch,
} from "./freeTierInstanceTypes.js";

const FREE_TIER_INSTANCES = FREE_TIER_INSTANCE_TYPES;
const INSTANCE_TYPES_BY_SIZE = {
  small: FREE_TIER_INSTANCE_TYPES,
  medium: ["t3.small"],
  large: ["t3.small"],
};

const UBUNTU_AMI_ID = "ami-0c55b159cbfafe1f0"; // Ubuntu 20.04 LTS (will be auto-detected)
const INSTANCE_NAME = "DevOpsHub-Auto-Deployed";
const SSM_INSTANCE_ROLE_NAME = "DevOpsHub-SSM-EC2-Role";
const SSM_INSTANCE_PROFILE_NAME = "DevOpsHub-SSM-EC2-InstanceProfile";
const SSM_MANAGED_POLICY_ARN = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore";

function isRealAwsInstanceId(instanceId) {
  return /^i-[a-f0-9]{8,17}$/i.test(String(instanceId || ""));
}

function isUsableIp(value) {
  const ip = String(value || "").trim();
  return Boolean(ip && ip !== "pending" && ip !== "unknown" && ip !== "0.0.0.0");
}

class EC2IntelligentProvisioningService {
  constructor() {
    this.validateStartupDependencies();
  }

  validateStartupDependencies() {
    if (!AWSInfrastructure?.findOne) {
      throw new Error("AWS infrastructure model is missing or not loaded");
    }
    if (!AWSConnection?.findOne) {
      throw new Error("AWS connection model is missing or not loaded");
    }
    if (!awsProviderService?.getEC2Client) {
      throw new Error("AWS infrastructure service is missing EC2 client support");
    }
    console.log("[AWS] Infrastructure service loaded");
  }

  /**
   * Main entry point: Provision or reuse EC2 instance
   */
  async provisionOrReuse(userId, deploymentConfig, repositoryAnalysis) {
    this.validateStartupDependencies();
    console.log("[AWS] Provisioning started", {
      userId,
      repo: `${deploymentConfig.owner}/${deploymentConfig.repo}`,
      region: deploymentConfig.region,
    });

    try {
      const awsConnection = await this.getAWSConnection(userId, deploymentConfig.region);

      // Step 1: Discover existing instances
      const existingInstances = await this.discoverExistingInstances(userId, awsConnection);
      console.log(`[EC2 Provisioning] Found ${existingInstances.length} existing instances`);

      // Step 2: Check for suitable DevOpsHub-managed instance
      const suitableInstance = await this.findSuitableInstance(
        userId,
        awsConnection,
        existingInstances,
        repositoryAnalysis
      );

      if (suitableInstance) {
        console.log("[EC2 Provisioning] Reusing existing instance:", suitableInstance.instanceId);
        console.log("[AWS] Provisioning completed", { instanceId: suitableInstance.instanceId });
        return suitableInstance;
      }

      // Step 3: Check AWS account free-tier eligibility
      const isFreeTierEligible = await this.checkFreeTierEligibility(userId);
      console.log("[EC2 Provisioning] Free-tier eligible:", isFreeTierEligible);

      // Step 4: Determine instance type based on repo size and account type
      const instanceType = this.determineInstanceType(
        repositoryAnalysis,
        isFreeTierEligible,
        deploymentConfig.preferredInstanceType
      );
      console.log("[EC2 Provisioning] Selected instance type:", instanceType);

      // Step 5: Check AWS quotas and cost impact
      await this.checkAwsQuotasAndCost(userId, instanceType);

      // Step 6: Create new instance
      const newInstance = await this.createNewInstance(
        userId,
        awsConnection,
        deploymentConfig,
        instanceType
      );

      console.log("[EC2 Provisioning] Created new instance:", newInstance.instanceId);
      console.log("[AWS] Provisioning completed", { instanceId: newInstance.instanceId });
      return newInstance;
    } catch (error) {
      console.error("[EC2 Provisioning] Error:", error);
      throw new Error(`EC2 provisioning failed: ${error.message}`);
    }
  }

  async getAWSConnection(userId, requestedRegion) {
    const query = {
      userId,
      connected: true,
      ...(requestedRegion ? { region: requestedRegion } : {}),
    };
    let awsConnection = await AWSConnection.findOne(query).lean();

    if (!awsConnection && requestedRegion) {
      awsConnection = await AWSConnection.findOne({ userId, connected: true }).lean();
    }

    if (!awsConnection) {
      throw new Error("AWS Account must be connected before infrastructure provisioning");
    }
    if (!awsConnection.encryptedCredentials) {
      throw new Error("AWS connection is missing encrypted credentials");
    }
    if (!awsConnection.region) {
      throw new Error("AWS connection is missing a region");
    }

    return awsConnection;
  }

  async getEC2Client(userId, awsConnection) {
    const { client } = await awsProviderService.getEC2Client(
      userId,
      awsConnection.encryptedCredentials,
      awsConnection.region
    );
    return client;
  }

  async getIAMClient(userId, awsConnection) {
    const ec2ClientResult = await awsProviderService.getEC2Client(
      userId,
      awsConnection.encryptedCredentials,
      awsConnection.region
    );
    return new IAMClient({
      region: awsConnection.region,
      credentials: ec2ClientResult.credentials,
    });
  }

  async ensureSsmInstanceProfile(userId, awsConnection) {
    const iamClient = await this.getIAMClient(userId, awsConnection);
    const assumeRolePolicyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    });

    try {
      await iamClient.send(new GetRoleCommand({ RoleName: SSM_INSTANCE_ROLE_NAME }));
    } catch (error) {
      if (error.name !== "NoSuchEntityException") throw error;
      await iamClient.send(new CreateRoleCommand({
        RoleName: SSM_INSTANCE_ROLE_NAME,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Description: "Allows DevOpsHub EC2 instances to run AWS Systems Manager commands",
      }));
    }

    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: SSM_INSTANCE_ROLE_NAME,
      PolicyArn: SSM_MANAGED_POLICY_ARN,
    }));

    let profile;
    try {
      profile = await iamClient.send(new GetInstanceProfileCommand({
        InstanceProfileName: SSM_INSTANCE_PROFILE_NAME,
      }));
    } catch (error) {
      if (error.name !== "NoSuchEntityException") throw error;
      profile = await iamClient.send(new CreateInstanceProfileCommand({
        InstanceProfileName: SSM_INSTANCE_PROFILE_NAME,
      }));
    }

    const hasRole = profile.InstanceProfile?.Roles?.some((role) => role.RoleName === SSM_INSTANCE_ROLE_NAME);
    if (!hasRole) {
      try {
        await iamClient.send(new AddRoleToInstanceProfileCommand({
          InstanceProfileName: SSM_INSTANCE_PROFILE_NAME,
          RoleName: SSM_INSTANCE_ROLE_NAME,
        }));
      } catch (error) {
        if (error.name !== "LimitExceededException") throw error;
      }
    }

    logger.info("[SSM] EC2 instance profile ready", {
      instanceProfileName: SSM_INSTANCE_PROFILE_NAME,
      roleName: SSM_INSTANCE_ROLE_NAME,
      policyArn: SSM_MANAGED_POLICY_ARN,
    });

    return SSM_INSTANCE_PROFILE_NAME;
  }

  /**
   * Discover existing EC2 instances in the account
   */
  async discoverExistingInstances(userId, awsConnection) {
    try {
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      const command = new DescribeInstancesCommand({
        Filters: [
          {
            Name: "instance-state-name",
            Values: ["running", "stopped"],
          },
        ],
      });

      const response = await ec2Client.send(command);
      const instances = [];

      for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) {
          const tags = instance.Tags || [];
          const nameTag = tags.find((t) => t.Key === "Name")?.Value;
          const managedByTag = tags.find((t) => t.Key === "ManagedBy")?.Value;
          const environmentTag = tags.find((t) => t.Key === "Environment")?.Value;

          instances.push({
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            state: instance.State.Name,
            publicIp: instance.PublicIpAddress,
            publicDns: instance.PublicDnsName,
            privateIp: instance.PrivateIpAddress,
            launchTime: instance.LaunchTime,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            securityGroupIds: instance.SecurityGroups?.map((sg) => sg.GroupId) || [],
            managedByDevOpsHub: managedByTag === "DevOpsHub",
            environment: environmentTag,
            name: nameTag,
            rawInstance: instance,
          });
        }
      }

      return instances;
    } catch (error) {
      console.error("[EC2] Error discovering instances:", error);
      return [];
    }
  }

  /**
   * Find a suitable existing instance to reuse
   */
  async findSuitableInstance(userId, awsConnection, instances, repositoryAnalysis) {
    const savedInfrastructure = await AWSInfrastructure.findOne({
      userId,
      region: awsConnection.region,
      ec2Status: "running",
      deploymentStatus: { $in: ["ready", "deployed", "provisioning", "bootstrapping"] },
    }).sort({ updatedAt: -1 }).lean();

    if (savedInfrastructure && this.hasAdequateResources(savedInfrastructure, repositoryAnalysis)) {
      const verified = await this.verifyAwsInstance(userId, awsConnection, savedInfrastructure.instanceId).catch((error) => {
        logger.warn("[EC2] Ignoring saved infrastructure that AWS could not verify", {
          instanceId: savedInfrastructure.instanceId,
          error: error.message,
        });
        return null;
      });

      if (!verified || verified.state !== "running") {
        return null;
      }

      await this.tagInstanceForDeployment(userId, awsConnection, savedInfrastructure.instanceId);
      return {
        instanceId: verified.instanceId,
        instanceType: verified.instanceType,
        state: verified.state,
        publicIp: verified.publicIp,
        publicDns: verified.publicDns,
        privateIp: verified.privateIp,
        securityGroupId: verified.securityGroupId,
        vpcId: verified.vpcId,
        subnetId: verified.subnetId,
        region: awsConnection.region,
        bootstrapped: savedInfrastructure.bootstrapStatus === "success",
        bootstrapStatus: savedInfrastructure.bootstrapStatus,
        keyPairName: savedInfrastructure.keyPairName,
      };
    }

    // Filter for DevOpsHub-managed, running instances
    const candidates = instances.filter(
      (i) => i.managedByDevOpsHub && i.state === "running"
    );

    if (candidates.length === 0) {
      return null;
    }

    // Prefer instances with available capacity
    // For now, just return the first running DevOpsHub instance
    const suitableInstance = candidates[0];
    const storedCandidate = await AWSInfrastructure.findOne({
      userId,
      instanceId: suitableInstance.instanceId,
    }).lean();

    // Check if instance has adequate resources
    if (this.hasAdequateResources(suitableInstance, repositoryAnalysis)) {
      const verified = await this.verifyAwsInstance(userId, awsConnection, suitableInstance.instanceId);
      if (verified.state !== "running") return null;
      // Tag it with current deployment
      await this.tagInstanceForDeployment(userId, awsConnection, suitableInstance.instanceId);
      return {
        ...suitableInstance,
        ...verified,
        securityGroupIds: suitableInstance.securityGroupIds,
        keyPairName: storedCandidate?.keyPairName,
      };
    }

    return null;
  }

  /**
   * Check if instance has adequate resources
   */
  hasAdequateResources(instance, repositoryAnalysis) {
    return FREE_TIER_INSTANCE_TYPES.includes(instance.instanceType);
  }

  /**
   * Check AWS account free-tier eligibility
   */
  async checkFreeTierEligibility(userId) {
    try {
      // In production, check AWS cost explorer and account metadata
      // For now, assume free-tier if using minimal resources
      return true;
    } catch (error) {
      console.warn("[EC2] Could not determine free-tier status:", error);
      return false;
    }
  }

  /**
   * Determine instance type based on repo size and account type
   */
  determineInstanceType(repositoryAnalysis, isFreeTierEligible, preferredInstanceType) {
    if (preferredInstanceType) {
      return getConfiguredInstanceType(preferredInstanceType);
    }

    if (process.env.AWS_INSTANCE_TYPE) {
      return getConfiguredInstanceType(INSTANCE_TYPE);
    }

    const repoSize = repositoryAnalysis?.size || 0;
    if (!isFreeTierEligible || repoSize >= 100 * 1024 * 1024) {
      return "t3.small";
    }

    return "t3.micro";
  }

  /**
   * Check AWS quotas and cost impact
   */
  async checkAwsQuotasAndCost(userId, instanceType) {
    try {
      // Check instance quota
      // Check if account would exceed spending limits
      // For now, just log the check
      console.log("[EC2] Checking quotas and costs for instance type:", instanceType);
      return true;
    } catch (error) {
      console.warn("[EC2] Quota/cost check failed:", error);
      return true; // Continue anyway
    }
  }

  /**
   * Create new EC2 instance
   */
  async createNewInstance(userId, awsConnection, deploymentConfig, instanceType) {
    try {
      const validatedInstanceType = getConfiguredInstanceType(instanceType);
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      const deploymentId = deploymentConfig.deploymentId || `deployment-${Date.now()}`;
      const ssmInstanceProfileName = await this.ensureSsmInstanceProfile(userId, awsConnection);

      // Step 1: Create security group
      const securityGroup = await this.createSecurityGroup(userId, awsConnection, deploymentConfig);
      console.log("[EC2] Security group created:", securityGroup.groupId);

      // Step 2: Get latest Ubuntu AMI
      const amiId = await this.getLatestUbuntuAmi(userId, awsConnection);
      console.log("[EC2] Using AMI:", amiId);

      // Step 3: Create bootstrap script
      const bootstrapScript = this.generateBootstrapScript();

      const buildRunInstancesCommand = (launchInstanceType) => {
        getConfiguredInstanceType(launchInstanceType);
        return new RunInstancesCommand({
          ImageId: amiId,
          InstanceType: launchInstanceType,
          MinCount: 1,
          MaxCount: 1,
          IamInstanceProfile: { Name: ssmInstanceProfileName },
          SecurityGroupIds: [securityGroup.groupId],
          UserData: Buffer.from(bootstrapScript).toString("base64"),
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                { Key: "Name", Value: INSTANCE_NAME },
                { Key: "ManagedBy", Value: "DevOpsHub" },
                { Key: "Environment", Value: "Production" },
                { Key: "AutoCreated", Value: "true" },
                {
                  Key: "CreatedAt",
                  Value: new Date().toISOString(),
                },
                {
                  Key: "Repository",
                  Value: `${deploymentConfig.owner}/${deploymentConfig.repo}`,
                },
                {
                  Key: "DeploymentId",
                  Value: deploymentId,
                },
                {
                  Key: "SSMManaged",
                  Value: "true",
                },
              ],
            },
            {
              ResourceType: "volume",
              Tags: [
                { Key: "ManagedBy", Value: "DevOpsHub" },
                { Key: "Environment", Value: "Production" },
              ],
            },
          ],
        });
      };

      let launchedInstanceType = validatedInstanceType;
      logEC2Launch(launchedInstanceType, awsConnection.region);

      let response;
      try {
        response = await ec2Client.send(buildRunInstancesCommand(launchedInstanceType));
      } catch (error) {
        console.error("[EC2] RunInstances failed, retrying once with t3.micro", {
          attemptedInstanceType: launchedInstanceType,
          awsError: getAwsErrorResponse(error),
        });
        launchedInstanceType = "t3.micro";
        logEC2Launch(launchedInstanceType, awsConnection.region);
        response = await ec2Client.send(buildRunInstancesCommand(launchedInstanceType));
      }
      const instance = response.Instances[0];

      console.log("[EC2] Instance created:", instance.InstanceId);

      // Step 3: Allocate and associate Elastic IP
      const elasticIp = await this.allocateAndAssociateElasticIp(
        userId,
        awsConnection,
        instance.InstanceId
      );
      console.log("[EC2] Elastic IP allocated:", elasticIp);

      // Step 4: Wait for instance to be running
      await this.waitForInstanceRunning(userId, awsConnection, instance.InstanceId);

      // Step 5: Get final instance details
      const finalInstance = await this.verifyAwsInstance(
        userId,
        awsConnection,
        instance.InstanceId
      );

      await AWSInfrastructure.findOneAndUpdate(
        { userId, instanceId: instance.InstanceId },
        {
          $set: {
            userId,
            awsConnectionId: awsConnection._id,
            instanceId: instance.InstanceId,
            instanceType: launchedInstanceType,
            operatingSystem: "ubuntu",
            storageSize: 30,
            region: awsConnection.region,
            securityGroupId: securityGroup.groupId,
            securityGroupName: securityGroup.groupName,
            publicIp: elasticIp || finalInstance.publicIp,
            publicDns: finalInstance.publicDns,
            privateIp: finalInstance.privateIp,
            vpcId: finalInstance.vpcId,
            subnetId: finalInstance.subnetId,
            ec2Status: finalInstance.state,
            deploymentStatus: "ready",
            bootstrapStatus: "success",
            keyPairName: null,
            privateKey: null,
            keyGeneratedAt: null,
            tags: {
              Name: INSTANCE_NAME,
              ManagedBy: "DevOpsHub",
              DeploymentId: deploymentId,
              SSMManaged: "true",
            },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      logger.info("[EC2] Instance SSM metadata stored", {
        deploymentId,
        instanceId: instance.InstanceId,
        instanceProfileName: ssmInstanceProfileName,
        publicIp: elasticIp || finalInstance.publicIp,
      });

      return {
        instanceId: instance.InstanceId,
        instanceType: launchedInstanceType,
        publicIp: elasticIp || finalInstance.publicIp,
        publicDns: finalInstance.publicDns,
        privateIp: finalInstance.privateIp,
        state: finalInstance.state,
        keyPairName: null,
        ssmManaged: true,
        iamInstanceProfile: ssmInstanceProfileName,
        securityGroupId: securityGroup.groupId,
        securityGroupName: securityGroup.groupName,
        vpcId: finalInstance.vpcId,
        subnetId: finalInstance.subnetId,
        region: awsConnection.region,
        launchTime: instance.LaunchTime,
        bootstrapped: true,
        bootstrapStatus: "success",
      };
    } catch (error) {
      console.error("[EC2] Error creating instance:", error);
      throw error;
    }
  }

  /**
   * Create security group with necessary rules
   */
  async createSecurityGroup(userId, awsConnection, deploymentConfig) {
    try {
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      // Get default VPC
      const vpcResponse = await ec2Client.send(
        new DescribeVpcsCommand({
          Filters: [{ Name: "isDefault", Values: ["true"] }],
        })
      );

      const vpcId = vpcResponse.Vpcs?.[0]?.VpcId;
      if (!vpcId) {
        throw new Error("No default VPC found for EC2 security group creation");
      }

      const sgName = `devops-hub-${Date.now()}`;

      // Create security group
      const createSgCommand = new CreateSecurityGroupCommand({
        GroupName: sgName,
        Description: `DevOpsHub security group for ${deploymentConfig.owner}/${deploymentConfig.repo}`,
        VpcId: vpcId,
      });

      const sgResponse = await ec2Client.send(createSgCommand);
      const groupId = sgResponse.GroupId;

      // Add ingress rules
      const rules = [
        { IpProtocol: "tcp", FromPort: 22, ToPort: 22 }, // SSH
        { IpProtocol: "tcp", FromPort: 80, ToPort: 80 }, // HTTP
        { IpProtocol: "tcp", FromPort: 3033, ToPort: 3033 }, // Compose service
        { IpProtocol: "tcp", FromPort: 3034, ToPort: 3034 }, // Compose service
        { IpProtocol: "tcp", FromPort: 3035, ToPort: 3035 }, // Compose service
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443 }, // HTTPS
        { IpProtocol: "tcp", FromPort: 3000, ToPort: 3000 }, // Common app port
        { IpProtocol: "tcp", FromPort: 8080, ToPort: 8080 }, // Jenkins
        { IpProtocol: "tcp", FromPort: 5000, ToPort: 5000 }, // DevOps Hub API
      ];

      const existingSecurityGroup = await ec2Client.send(
        new DescribeSecurityGroupsCommand({ GroupIds: [groupId] })
      );
      const existingPermissions = existingSecurityGroup.SecurityGroups?.[0]?.IpPermissions || [];

      for (const rule of rules) {
        const exists = existingPermissions.some(
          (permission) =>
            permission.IpProtocol === rule.IpProtocol &&
            permission.FromPort === rule.FromPort &&
            permission.ToPort === rule.ToPort &&
            permission.IpRanges?.some((range) => range.CidrIp === "0.0.0.0/0")
        );
        if (exists) continue;

        await ec2Client.send(
          new AuthorizeSecurityGroupIngressCommand({
            GroupId: groupId,
            IpPermissions: [
              {
                ...rule,
                IpRanges: [{ CidrIp: "0.0.0.0/0" }],
              },
            ],
          })
        );
      }

      // Tag security group
      await ec2Client.send(
        new CreateTagsCommand({
          Resources: [groupId],
          Tags: [
            { Key: "Name", Value: sgName },
            { Key: "ManagedBy", Value: "DevOpsHub" },
            { Key: "Environment", Value: "Production" },
          ],
        })
      );

      return { groupId, groupName: sgName };
    } catch (error) {
      console.error("[EC2] Error creating security group:", error);
      throw error;
    }
  }

  /**
   * Get latest Ubuntu AMI ID
   */
  async getLatestUbuntuAmi(userId, awsConnection) {
    try {
      const amiInfo = await awsProviderService.getAMIIds(
        userId,
        awsConnection.encryptedCredentials,
        awsConnection.region,
        "ubuntu"
      );
      return amiInfo?.amiId || UBUNTU_AMI_ID;
    } catch (error) {
      logger.warn("[EC2] Error getting Ubuntu AMI, falling back to default", {
        userId,
        region: awsConnection.region,
        error: error.message,
      });
      return UBUNTU_AMI_ID; // Fallback
    }
  }

  /**
   * Generate EC2 bootstrap script
   */
  generateBootstrapScript() {
    return `#!/bin/bash
set -e

# Update system
apt-get update
apt-get install -y snapd curl ca-certificates
if ! command -v amazon-ssm-agent >/dev/null 2>&1; then
  snap install amazon-ssm-agent --classic || true
fi
systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service || true
systemctl restart snap.amazon-ssm-agent.amazon-ssm-agent.service || systemctl restart amazon-ssm-agent || true
echo "DevOpsHub SSM bootstrap completed at \$(date)" > /var/log/devops-hub-bootstrap.log
`;
  }

  /**
   * Allocate and associate Elastic IP
   */
  async allocateAndAssociateElasticIp(userId, awsConnection, instanceId) {
    try {
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      // Allocate Elastic IP
      const allocateCommand = new AllocateAddressCommand({
        Domain: "vpc",
      });

      const allocateResponse = await ec2Client.send(allocateCommand);
      const allocationId = allocateResponse.AllocationId;
      const publicIp = allocateResponse.PublicIp;

      // Associate with instance
      const associateCommand = new AssociateAddressCommand({
        InstanceId: instanceId,
        AllocationId: allocationId,
      });

      await ec2Client.send(associateCommand);

      // Tag Elastic IP
      await ec2Client.send(
        new CreateTagsCommand({
          Resources: [allocationId],
          Tags: [
            { Key: "ManagedBy", Value: "DevOpsHub" },
            { Key: "Environment", Value: "Production" },
          ],
        })
      );

      return publicIp;
    } catch (error) {
      console.error("[EC2] Error allocating Elastic IP:", error);
      return null; // Continue without Elastic IP
    }
  }

  /**
   * Wait for instance to be running
   */
  async waitForInstanceRunning(userId, awsConnection, instanceId, maxWaitTime = 5 * 60 * 1000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitTime) {
      const instance = await this.getInstanceDetails(userId, awsConnection, instanceId);

      if (instance.state === "running") {
        console.log("[EC2] Instance is running:", instanceId);
        return instance;
      }

      if (instance.state === "terminated" || instance.state === "terminating") {
        throw new Error("Instance terminated unexpectedly");
      }

      console.log("[EC2] Waiting for instance to be running... Current state:", instance.state);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Timeout waiting for instance to be running");
  }

  /**
   * Get instance details
   */
  async getInstanceDetails(userId, awsConnection, instanceId) {
    try {
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      const response = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );

      const instance =
        response.Reservations[0]?.Instances[0];

      if (!instance) {
        throw new Error("Instance not found");
      }

      return {
        instanceId: instance.InstanceId,
        state: instance.State.Name,
        publicIp: instance.PublicIpAddress,
        publicDns: instance.PublicDnsName,
        privateIp: instance.PrivateIpAddress,
        instanceType: instance.InstanceType,
        vpcId: instance.VpcId,
        subnetId: instance.SubnetId,
        securityGroupId: instance.SecurityGroups?.[0]?.GroupId,
        securityGroupIds: instance.SecurityGroups?.map((sg) => sg.GroupId) || [],
        launchTime: instance.LaunchTime,
        rawInstance: instance,
      };
    } catch (error) {
      console.error("[EC2] Error getting instance details:", error);
      throw error;
    }
  }

  async verifyAwsInstance(userId, awsConnection, instanceId) {
    if (!isRealAwsInstanceId(instanceId)) {
      throw new Error(`Invalid EC2 instance id: ${instanceId}`);
    }

    const details = await this.getInstanceDetails(userId, awsConnection, instanceId);
    if (details.state !== "running") {
      throw new Error(`EC2 instance ${instanceId} is not running. Current state: ${details.state}`);
    }
    if (!isUsableIp(details.publicIp)) {
      throw new Error(`EC2 instance ${instanceId} does not have a usable public IP`);
    }
    if (!isUsableIp(details.privateIp)) {
      throw new Error(`EC2 instance ${instanceId} does not have a usable private IP`);
    }
    if (!details.securityGroupId && !details.securityGroupIds?.length) {
      throw new Error(`EC2 instance ${instanceId} has no security group`);
    }

    return details;
  }

  /**
   * Tag instance for deployment
   */
  async tagInstanceForDeployment(userId, awsConnection, instanceId) {
    try {
      const ec2Client = await this.getEC2Client(userId, awsConnection);

      await ec2Client.send(
        new CreateTagsCommand({
          Resources: [instanceId],
          Tags: [
            {
              Key: "LastDeployment",
              Value: new Date().toISOString(),
            },
          ],
        })
      );
    } catch (error) {
      console.warn("[EC2] Error tagging instance:", error);
    }
  }
}

export const ec2IntelligentProvisioningService = new EC2IntelligentProvisioningService();
