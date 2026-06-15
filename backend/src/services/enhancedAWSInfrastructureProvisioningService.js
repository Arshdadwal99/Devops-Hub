/**
 * Enhanced AWS Infrastructure Provisioning Service
 * Handles EC2 instance creation with detailed logging, error handling, and progress tracking
 * Supports both synchronous (old) and asynchronous (new) provisioning
 */

import {
  RunInstancesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeVpcsCommand,
  DescribeSecurityGroupsCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import { awsProviderService } from "./awsProviderService.js";
import { ec2AutoKeyGenerationService } from "./ec2AutoKeyGenerationService.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { logger } from "../utils/logger.js";
import { provisioningJobQueue } from "./provisioningJobQueue.js";
import {
  INSTANCE_TYPE,
  getAwsErrorResponse,
  getConfiguredInstanceType,
  logEC2Launch,
} from "./freeTierInstanceTypes.js";

class EnhancedAWSInfrastructureProvisioningService {
  constructor() {
    this.bootstrapScripts = {
      ubuntu: this.getUbuntuBootstrapScript,
      "amazon-linux": this.getAmazonLinuxBootstrapScript,
    };
    this.awsTimeouts = {
      DescribeVpcs: 15000,
      DescribeSecurityGroups: 15000,
      CreateSecurityGroup: 30000,
      AuthorizeSecurityGroupIngress: 30000,
      DescribeImages: 30000,
      RunInstances: 60000,
      DescribeInstances: 15000,
    };
    this.awsRequestTimeout = 30000;
    this.overallTimeout = 15 * 60 * 1000; // 15 minutes total
  }

  /**
   * Start asynchronous infrastructure provisioning
   * Returns immediately with jobId
   */
  async startAsyncProvisioning(userId, awsConnectionId, config) {
    // Create job
    const jobInfo = await provisioningJobQueue.createJob(userId, awsConnectionId, config);

    // Start provisioning in background (don't await)
    this.provisionInBackground(userId, awsConnectionId, config, jobInfo.jobId);

    return jobInfo;
  }

  /**
   * Provision infrastructure in background
   */
  async provisionInBackground(userId, awsConnectionId, config, jobId) {
    try {
      await provisioningJobQueue.startJob(jobId, async (jobId, updateStep, updateDebug) => {
        return await this.createInfrastructureWithProgress(
          userId,
          awsConnectionId,
          config,
          updateStep,
          updateDebug
        );
      });
    } catch (error) {
      logger.error("Background provisioning failed", {
        jobId,
        error: error.message,
      });
    }
  }

  /**
   * Create infrastructure with detailed progress tracking
   */
  async createInfrastructureWithProgress(
    userId,
    awsConnectionId,
    config,
    updateStep,
    updateDebug
  ) {
    const startTime = Date.now();
    const steps = {
      initialization: 0,
      creating_security_group: 15,
      authorizing_security_group: 30,
      fetching_ami: 45,
      creating_ec2_instance: 60,
      waiting_running_state: 90,
      allocating_public_ip: 95,
      completing: 100,
    };

    try {
      const {
        instanceType = INSTANCE_TYPE,
        os = "ubuntu",
        storageSize = 30,
        name = "DevOps-Hub-Instance",
        region,
      } = config;
      const validatedInstanceType = getConfiguredInstanceType(instanceType);

      // Step: Initialization
      await updateStep(
        "initialization",
        "in_progress",
        "Starting infrastructure provisioning",
        { progress: steps.initialization }
      );

      if (!region) {
        throw new Error("Region is required for infrastructure provisioning");
      }

      logger.info("Infrastructure provisioning initialization", {
        userId,
        instanceType: validatedInstanceType,
        os,
        storageSize,
        name,
        region,
      });

      // Get AWS connection and credentials
      const connection = await this.getAWSConnection(userId, awsConnectionId);
      if (!connection) {
        throw new Error("AWS connection not found or not active");
      }
      const accountId = connection.accountId;

      await this.recordDebug(updateDebug, {
        message: "[SUCCESS] AWS Connection Loaded",
        details: { region, accountId, instanceType: validatedInstanceType },
      });

      // Step: Creating Security Group
      logger.info("Creating security group", {
        userId,
        region,
        accountId,
        name,
      });

      let securityGroupId;
      try {
        securityGroupId = await this.createSecurityGroupWithLogging(
          userId,
          connection.encryptedCredentials,
          region,
          accountId,
          name,
          updateStep,
          updateDebug,
          steps
        );
      } catch (error) {
        await updateStep(
          "creating_security_group",
          "failed",
          `Security group creation failed: ${error.message}`,
          {
            error: error.message,
            awsErrorCode: error.code,
          }
        );
        throw error;
      }

      // Step: Fetching AMI
      await updateStep(
        "fetching_ami",
        "in_progress",
        "Fetching AMI",
        { progress: steps.fetching_ami }
      );

      logger.info("Fetching AMI ID", {
        os,
        region,
      });

      let amiInfo;
      try {
        amiInfo = await this.getAMIWithLogging(
          userId,
          connection.encryptedCredentials,
          region,
          accountId,
          os === "amazon-linux" ? "amazon-linux" : "ubuntu",
          updateDebug
        );

        if (!amiInfo || !amiInfo.amiId) {
          throw new Error("Could not fetch AMI ID for specified OS and region");
        }

        logger.info("AMI ID fetched", {
          amiId: amiInfo.amiId,
          os,
          region,
        });
      } catch (error) {
        await updateStep(
          "fetching_ami",
          "failed",
          `AMI fetch failed: ${error.message}`,
          {
            error: error.message,
            awsErrorCode: error.code,
          }
        );
        throw new Error(`Failed to fetch AMI: ${error.message}`);
      }

      await updateStep(
        "fetching_ami",
        "completed",
        "Retrieving AMI completed",
        { progress: steps.fetching_ami }
      );

      // Get bootstrap script
      const bootstrapScript = this.getBootstrapScript(os);
      const deploymentId = config.deploymentId || `deployment-${Date.now()}`;
      const generatedKey = await ec2AutoKeyGenerationService.generateDeploymentKeyPair(
        deploymentId,
        userId,
        connection,
        region
      );

      logger.info("Generated EC2 key pair for infrastructure provisioning", {
        deploymentId,
        keyName: generatedKey.keyName,
      });
      await this.recordDebug(updateDebug, {
        message: "[SUCCESS] EC2 Key Pair Generated",
        awsOperation: "CreateKeyPair",
        details: { deploymentId, keyName: generatedKey.keyName },
      });

      // Step: Creating EC2 Instance
      await updateStep(
        "creating_ec2_instance",
        "in_progress",
        "Creating EC2 instance",
        { progress: steps.creating_ec2_instance }
      );

      logger.info("Creating EC2 instance", {
        instanceType: validatedInstanceType,
        amiId: amiInfo.amiId,
        region,
      });

      let instanceInfo;
      try {
        instanceInfo = await this.createInstanceWithLogging(
          userId,
          connection.encryptedCredentials,
          region,
          accountId,
          {
            amiId: amiInfo.amiId,
            instanceType: validatedInstanceType,
            storageSize,
            securityGroupId,
            name,
            bootstrapScript,
            os,
            deploymentId,
            generatedKeyName: generatedKey.keyName,
          },
          updateStep,
          updateDebug,
          steps
        );

        logger.info("EC2 instance created successfully", {
          instanceId: instanceInfo.instanceId,
          state: instanceInfo.state,
        });
        
        // Log instance creation event
        logger.info("🚀 [INSTANCE CREATED]", {
          event: "InstanceCreated",
          instanceId: instanceInfo.instanceId,
          instanceType: validatedInstanceType,
          deploymentId,
          keyName: generatedKey.keyName,
          timestamp: new Date().toISOString(),
          region,
        });
      } catch (error) {
        await updateStep(
          "creating_ec2_instance",
          "failed",
          `EC2 instance creation failed: ${error.message}`,
          {
            error: error.message,
            awsErrorCode: error.code,
          }
        );
        throw error;
      }

      await updateStep(
        "creating_ec2_instance",
        "completed",
        "Creating EC2 Instance completed",
        { progress: steps.creating_ec2_instance }
      );

      // Step: Waiting for Running State
      await updateStep(
        "waiting_running_state",
        "in_progress",
        "Waiting for instance to reach running state",
        { progress: steps.waiting_running_state }
      );

      logger.info("Waiting for EC2 instance to run", {
        instanceId: instanceInfo.instanceId,
        region,
      });

      let runningInstance;
      try {
        runningInstance = await this.waitForInstanceRunningWithLogging(
          userId,
          connection.encryptedCredentials,
          region,
          accountId,
          instanceInfo.instanceId,
          updateStep,
          updateDebug
        );

        logger.info("EC2 instance now running", {
          instanceId: runningInstance.instanceId,
          publicIp: runningInstance.publicIp,
        });
        
        // Log instance running event
        logger.info("✅ [INSTANCE RUNNING]", {
          event: "InstanceRunning",
          instanceId: runningInstance.instanceId,
          instanceType: instanceInfo.instanceType || validatedInstanceType,
          timestamp: new Date().toISOString(),
          region,
          state: "running",
        });
      } catch (error) {
        await updateStep(
          "waiting_running_state",
          "failed",
          `Instance failed to reach running state: ${error.message}`,
          {
            error: error.message,
            awsErrorCode: error.code,
          }
        );
        throw error;
      }

      await updateStep(
        "waiting_running_state",
        "completed",
        "Waiting for Running State completed",
        { progress: steps.waiting_running_state }
      );

      // Step: Allocating Public IP
      await updateStep(
        "allocating_public_ip",
        "completed",
        `Public IP allocated: ${runningInstance.publicIp || "not assigned"}`,
        { progress: steps.allocating_public_ip }
      );

      // Log public IP assignment event
      logger.info("📍 [PUBLIC IP ASSIGNED]", {
        event: "PublicIpAssigned",
        instanceId: runningInstance.instanceId,
        publicIp: runningInstance.publicIp,
        publicDns: runningInstance.publicDns,
        timestamp: new Date().toISOString(),
        region,
      });

      // Step: Save to database
      await updateStep(
        "completing",
        "in_progress",
        "Saving infrastructure metadata",
        { progress: 98 }
      );

      logger.info("Saving infrastructure metadata", {
        instanceId: runningInstance.instanceId,
        region,
      });

      const infrastructure = new AWSInfrastructure({
        userId,
        awsConnectionId,
        instanceId: runningInstance.instanceId,
        instanceType: instanceInfo.instanceType || validatedInstanceType,
        operatingSystem: os,
        storageSize,
        region,
        securityGroupId,
        securityGroupName: name,
        publicIp: runningInstance.publicIp,
        publicDns: runningInstance.publicDns,
        privateIp: runningInstance.privateIp,
        keyPairName: generatedKey.keyName,
        privateKey: generatedKey.keyMaterial,
        keyGeneratedAt: generatedKey.createdAt || generatedKey.generatedAt,
        tags: {
          Name: name,
          ManagedBy: "DevOpsHub",
          CreatedAt: new Date().toISOString(),
          DeploymentId: deploymentId,
          KeyPairName: generatedKey.keyName,
        },
        bootstrapStatus: "pending",
        deploymentStatus: "provisioning",
      });

      await infrastructure.save();

      const duration = Date.now() - startTime;

      logger.info("Infrastructure provisioning completed successfully", {
        infrastructureId: infrastructure._id,
        instanceId: runningInstance.instanceId,
        publicIp: runningInstance.publicIp,
        duration: `${(duration / 1000).toFixed(2)}s`,
      });

      // Final provisioning summary log
      logger.info("✨ [PROVISIONING COMPLETE]", {
        event: "ProvisioningComplete",
        deploymentId,
        instanceId: runningInstance.instanceId,
        instanceType: instanceInfo.instanceType || validatedInstanceType,
        publicIp: runningInstance.publicIp,
        publicDns: runningInstance.publicDns,
        keyName: generatedKey.keyName,
        region,
        duration: `${(duration / 1000).toFixed(2)}s`,
      });

      return {
        success: true,
        deploymentId,
        instanceId: runningInstance.instanceId,
        publicIp: runningInstance.publicIp,
        publicDns: runningInstance.publicDns,
        keyName: generatedKey.keyName,
        infrastructure: {
          _id: infrastructure._id,
          instanceId: runningInstance.instanceId,
          instanceType: instanceInfo.instanceType || validatedInstanceType,
          operatingSystem: os,
          region,
          publicIp: runningInstance.publicIp,
          publicDns: runningInstance.publicDns,
          privateIp: runningInstance.privateIp,
          securityGroupId,
          keyPairName: generatedKey.keyName,
          generatedKeyName: generatedKey.keyName,
          generatedPrivateKey: generatedKey.keyMaterial,
          keyCreatedAt: generatedKey.createdAt || generatedKey.generatedAt,
          status: "running",
          bootstrapStatus: "pending",
          createdAt: infrastructure.createdAt,
        },
      };
    } catch (error) {
      logger.error("Infrastructure provisioning failed", {
        error: error.message,
        stack: error.stack,
      });
      error.executionStop = this.getExecutionStop(error);
      throw error;
    }
  }

  /**
   * Create security group with detailed logging
   */
  async createSecurityGroupWithLogging(
    userId,
    encryptedCredentials,
    region,
    accountId,
    name,
    updateStep,
    updateDebug,
    steps
  ) {
    const stepStartTime = Date.now();

    try {
      logger.info("Getting EC2 client for security group creation", { region });

      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      await updateStep(
        "creating_security_group",
        "in_progress",
        "Looking up VPC",
        { progress: steps.creating_security_group, awsOperation: "DescribeVpcs" }
      );

      await this.recordDebug(updateDebug, {
        message: "[STEP] Looking up VPC",
        awsOperation: "DescribeVpcs",
        details: { region, accountId },
      });

      logger.info("[STEP] Looking up VPC", { region, accountId });

      const vpcCommand = new DescribeVpcsCommand({
        Filters: [{ Name: "isDefault", Values: ["true"] }],
      });

      let vpcResponse = await this.executeAWSCommand(client, vpcCommand, {
        commandName: "DescribeVpcs",
        region,
        accountId,
        updateDebug,
      });

      let vpcId = vpcResponse.Vpcs?.[0]?.VpcId;
      if (!vpcId) {
        await this.recordDebug(updateDebug, {
          level: "warn",
          message: "[WARN] Default VPC not found, selecting first available VPC",
          awsOperation: "DescribeVpcs",
          details: { region, accountId },
        });

        vpcResponse = await this.executeAWSCommand(client, new DescribeVpcsCommand({}), {
          commandName: "DescribeVpcs",
          region,
          accountId,
          updateDebug,
        });
        vpcId = vpcResponse.Vpcs?.[0]?.VpcId;

        if (!vpcId) {
          const error = new Error(
            `No VPC found in region ${region}. Create a default VPC or add VPC creation support before provisioning EC2 infrastructure.`
          );
          error.code = "NO_VPC_FOUND";
          throw error;
        }
      }

      await this.recordDebug(updateDebug, {
        message: "[SUCCESS] VPC Found",
        awsOperation: "DescribeVpcs",
        details: { region, accountId, vpcId },
      });
      logger.info("[SUCCESS] VPC Found", { vpcId, region, accountId });

      const securityGroupName = this.buildSecurityGroupName(name);

      await this.recordDebug(updateDebug, {
        message: "[STEP] Checking Security Group",
        awsOperation: "DescribeSecurityGroups",
        details: { region, accountId, vpcId, securityGroupName },
      });

      const existingSgResponse = await this.executeAWSCommand(
        client,
        new DescribeSecurityGroupsCommand({
          Filters: [
            { Name: "group-name", Values: [securityGroupName] },
            { Name: "vpc-id", Values: [vpcId] },
          ],
        }),
        {
          commandName: "DescribeSecurityGroups",
          region,
          accountId,
          vpcId,
          securityGroupName,
          updateDebug,
        }
      );

      let securityGroupId = existingSgResponse.SecurityGroups?.[0]?.GroupId;
      if (securityGroupId) {
        await this.recordDebug(updateDebug, {
          message: "[SUCCESS] Security Group Reused",
          awsOperation: "DescribeSecurityGroups",
          details: { region, accountId, vpcId, securityGroupName, securityGroupId },
        });
        logger.info("[SUCCESS] Security Group Reused", {
          region,
          accountId,
          vpcId,
          securityGroupName,
          securityGroupId,
        });
        await updateStep(
          "creating_security_group",
          "completed",
          "Creating Security Group completed",
          {
            progress: steps.creating_security_group,
            awsOperation: "DescribeSecurityGroups",
            currentOperation: "DescribeSecurityGroups",
          }
        );
      } else {
        await updateStep(
          "creating_security_group",
          "in_progress",
          "Creating Security Group",
          { progress: steps.creating_security_group, awsOperation: "CreateSecurityGroup" }
        );

        await this.recordDebug(updateDebug, {
          message: "[STEP] Creating Security Group",
          awsOperation: "CreateSecurityGroup",
          details: { region, accountId, vpcId, securityGroupName },
        });

        logger.info("[STEP] Creating Security Group", {
          region,
          accountId,
          vpcId,
          securityGroupName,
        });

        const sgCommand = new CreateSecurityGroupCommand({
          GroupName: securityGroupName,
          Description: `DevOps Hub infrastructure security group - ${name}`.slice(0, 255),
          VpcId: vpcId,
          TagSpecifications: [
            {
              ResourceType: "security-group",
              Tags: [
                { Key: "Name", Value: securityGroupName },
                { Key: "ManagedBy", Value: "DevOpsHub" },
              ],
            },
          ],
        });

        let sgResponse;
        try {
          sgResponse = await this.executeAWSCommand(
            client,
            sgCommand,
            {
              commandName: "CreateSecurityGroup",
              region,
              accountId,
              vpcId,
              securityGroupName,
              updateDebug,
            }
          );
        } catch (error) {
          if (error.code !== "InvalidGroup.Duplicate") {
            throw error;
          }

          await this.recordDebug(updateDebug, {
            level: "warn",
            message: "[WARN] Security Group Already Exists, Reusing",
            awsOperation: "CreateSecurityGroup",
            details: { region, accountId, vpcId, securityGroupName },
          });

          const duplicateLookup = await this.executeAWSCommand(
            client,
            new DescribeSecurityGroupsCommand({
              Filters: [
                { Name: "group-name", Values: [securityGroupName] },
                { Name: "vpc-id", Values: [vpcId] },
              ],
            }),
            {
              commandName: "DescribeSecurityGroups",
              region,
              accountId,
              vpcId,
              securityGroupName,
              updateDebug,
            }
          );
          securityGroupId = duplicateLookup.SecurityGroups?.[0]?.GroupId;
          if (!securityGroupId) {
            throw error;
          }
        }

        securityGroupId = securityGroupId || sgResponse.GroupId;
        await this.recordDebug(updateDebug, {
          message: "[SUCCESS] Security Group Created",
          awsOperation: "CreateSecurityGroup",
          details: { region, accountId, vpcId, securityGroupName, securityGroupId },
        });
        logger.info("[SUCCESS] Security Group Created", {
          SecurityGroupId: securityGroupId,
          securityGroupId,
          securityGroupName,
          vpcId,
          region,
          accountId,
        });
        await updateStep(
          "creating_security_group",
          "completed",
          "Creating Security Group completed",
          {
            progress: steps.creating_security_group,
            awsOperation: "CreateSecurityGroup",
            currentOperation: "CreateSecurityGroup",
          }
        );
      }

      // Add ingress rules
      await updateStep(
        "authorizing_security_group",
        "in_progress",
        "Authorizing security group rules",
        { progress: steps.authorizing_security_group, awsOperation: "AuthorizeSecurityGroupIngress" }
      );
      await this.recordDebug(updateDebug, {
        message: "[STEP] Authorizing Ports",
        awsOperation: "AuthorizeSecurityGroupIngress",
        details: { region, accountId, vpcId, securityGroupName, securityGroupId },
      });
      logger.info("[STEP] Authorizing Ports", {
        region,
        accountId,
        vpcId,
        securityGroupName,
        securityGroupId,
      });

      const ports = [
        { port: 22, protocol: "tcp", description: "SSH" },
        { port: 80, protocol: "tcp", description: "HTTP" },
        { port: 3033, protocol: "tcp", description: "Compose service" },
        { port: 3034, protocol: "tcp", description: "Compose service" },
        { port: 3035, protocol: "tcp", description: "Compose service" },
        { port: 443, protocol: "tcp", description: "HTTPS" },
        { port: 3000, protocol: "tcp", description: "Application" },
        { port: 8080, protocol: "tcp", description: "Jenkins" },
        { port: 5000, protocol: "tcp", description: "DevOps Hub API" },
      ];

      const existingSecurityGroup = await client.send(
        new DescribeSecurityGroupsCommand({ GroupIds: [securityGroupId] })
      );
      const existingPermissions = existingSecurityGroup.SecurityGroups?.[0]?.IpPermissions || [];

      for (const { port, protocol, description } of ports) {
        const exists = existingPermissions.some(
          (permission) =>
            permission.IpProtocol === protocol &&
            permission.FromPort === port &&
            permission.ToPort === port &&
            permission.IpRanges?.some((range) => range.CidrIp === "0.0.0.0/0")
        );
        if (exists) continue;

        logger.info("Adding security group ingress rule", {
          port,
          protocol,
          description,
          securityGroupId,
        });

        const ingressCommand = new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: protocol,
              FromPort: port,
              ToPort: port,
              IpRanges: [
                {
                  CidrIp: "0.0.0.0/0",
                  Description: description,
                },
              ],
            },
          ],
        });

        try {
          await this.executeAWSCommand(
            client,
            ingressCommand,
            {
              commandName: "AuthorizeSecurityGroupIngress",
              region,
              accountId,
              vpcId,
              securityGroupName,
              securityGroupId,
              updateDebug,
              extra: { port, protocol, description },
            }
          );
          logger.info("Security group rule added", {
            port,
            description,
            securityGroupId,
          });
        } catch (error) {
          if (error.code !== "InvalidPermission.Duplicate") {
            throw new Error(
              `Failed to add security group rule for port ${port}: ${error.message}`
            );
          }
          logger.info("Security group rule already exists", {
            port,
            securityGroupId,
          });
        }
      }

      const duration = Date.now() - stepStartTime;
      logger.info("Security group creation completed", {
        securityGroupId,
        duration: `${(duration / 1000).toFixed(2)}s`,
      });

      await updateStep(
        "authorizing_security_group",
        "completed",
        "Authorizing Ports completed",
        { progress: steps.authorizing_security_group }
      );
      await this.recordDebug(updateDebug, {
        message: "[SUCCESS] Ports Authorized",
        awsOperation: "AuthorizeSecurityGroupIngress",
        details: { region, accountId, vpcId, securityGroupName, securityGroupId },
      });

      return securityGroupId;
    } catch (error) {
      logger.error("Security group creation failed", {
        error: error.message,
        region,
      });
      throw error;
    }
  }

  /**
   * Create EC2 instance with detailed logging
   */
  async createInstanceWithLogging(
    userId,
    encryptedCredentials,
    region,
    accountId,
    config,
    updateStep,
    updateDebug,
    steps
  ) {
    const stepStartTime = Date.now();

    try {
      logger.info("Getting EC2 client for instance creation", { region });

      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      const {
        amiId,
        instanceType,
        storageSize,
        securityGroupId,
        name,
        bootstrapScript,
        os,
        deploymentId,
        generatedKeyName,
      } =
        config;
      let launchInstanceType = getConfiguredInstanceType(instanceType);

      await this.recordDebug(updateDebug, {
        message: "[STEP] Creating EC2 Instance",
        awsOperation: "RunInstances",
        details: {
          region,
          accountId,
          amiId,
          instanceType: launchInstanceType,
          securityGroupId,
        },
      });

      logger.info("[STEP] Creating EC2 Instance", {
        amiId,
        instanceType: launchInstanceType,
        storageSize,
        securityGroupId,
        region,
        accountId,
      });

      const buildRunInstancesCommand = (nextInstanceType) => new RunInstancesCommand({
        ImageId: amiId,
        MinCount: 1,
        MaxCount: 1,
        InstanceType: getConfiguredInstanceType(nextInstanceType),
        KeyName: generatedKeyName,
        SecurityGroupIds: [securityGroupId],
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "Name", Value: name },
              { Key: "ManagedBy", Value: "DevOpsHub" },
              { Key: "CreatedAt", Value: new Date().toISOString() },
              { Key: "DeploymentId", Value: deploymentId },
              { Key: "KeyPairName", Value: generatedKeyName },
            ],
          },
          {
            ResourceType: "volume",
            Tags: [
              { Key: "Name", Value: `${name}-volume` },
              { Key: "ManagedBy", Value: "DevOpsHub" },
            ],
          },
        ],
        BlockDeviceMappings: [
          {
            DeviceName: os === "ubuntu" ? "/dev/sda1" : "/dev/xvda",
            Ebs: {
              VolumeSize: storageSize,
              VolumeType: "gp3",
              DeleteOnTermination: true,
            },
          },
        ],
        UserData: Buffer.from(bootstrapScript).toString("base64"),
        Monitoring: {
          Enabled: true,
        },
      });

      logEC2Launch(launchInstanceType, region);
      logger.info("Sending RunInstances command to AWS", { region, instanceType: launchInstanceType });

      let response;
      try {
        response = await this.executeAWSCommand(
          client,
          buildRunInstancesCommand(launchInstanceType),
          {
            commandName: "RunInstances",
            region,
            accountId,
            amiId,
            instanceType: launchInstanceType,
            securityGroupId,
            updateDebug,
          }
        );
      } catch (error) {
        logger.error("RunInstances failed, retrying once with t3.micro", {
          attemptedInstanceType: launchInstanceType,
          region,
          awsError: getAwsErrorResponse(error),
        });
        await this.recordDebug(updateDebug, {
          level: "error",
          message: "[ERROR] RunInstances failed, retrying once with t3.micro",
          awsOperation: "RunInstances",
          details: {
            attemptedInstanceType: launchInstanceType,
            region,
            awsError: getAwsErrorResponse(error),
          },
        });

        launchInstanceType = "t3.micro";
        logEC2Launch(launchInstanceType, region);
        try {
          response = await this.executeAWSCommand(
            client,
            buildRunInstancesCommand(launchInstanceType),
            {
              commandName: "RunInstances",
              region,
              accountId,
              amiId,
              instanceType: launchInstanceType,
              securityGroupId,
              updateDebug,
            }
          );
        } catch (retryError) {
          logger.error("RunInstances retry with t3.micro failed", {
            attemptedInstanceType: launchInstanceType,
            region,
            awsError: getAwsErrorResponse(retryError),
          });
          if (retryError.code === "InsufficientInstanceCapacity") {
            throw new Error(
              `Insufficient capacity for ${launchInstanceType} in ${region}. Try a different region.`
            );
          } else if (retryError.code === "InstanceLimitExceeded") {
            throw new Error(
              `EC2 instance quota exceeded in region ${region}. Request a quota increase from AWS.`
            );
          }
          throw new Error(`Failed to run instance: ${retryError.message}`);
        }
      }

      const instance = response.Instances?.[0];

      if (!instance) {
        throw new Error("No instance returned from AWS RunInstances command");
      }

      logger.info("EC2 instance created", {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        region,
      });
      await this.recordDebug(updateDebug, {
        message: "[SUCCESS] EC2 Instance Created",
        awsOperation: "RunInstances",
        details: {
          region,
          accountId,
          amiId,
          instanceType: instance.InstanceType,
          securityGroupId,
          instanceId: instance.InstanceId,
        },
      });

      const duration = Date.now() - stepStartTime;
      logger.info("Instance creation step completed", {
        instanceId: instance.InstanceId,
        duration: `${(duration / 1000).toFixed(2)}s`,
      });

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        publicIp: instance.PublicIpAddress,
        publicDns: instance.PublicDnsName,
        privateIp: instance.PrivateIpAddress,
      };
    } catch (error) {
      logger.error("EC2 instance creation failed", {
        error: error.message,
        region,
      });
      throw error;
    }
  }

  /**
   * Retrieve the latest AMI with provisioning debug logs.
   */
  async getAMIWithLogging(
    userId,
    encryptedCredentials,
    region,
    accountId,
    os,
    updateDebug
  ) {
    const { client } = await awsProviderService.getEC2Client(
      userId,
      encryptedCredentials,
      region
    );

    let filters = [];
    let owners = [];
    if (os === "ubuntu") {
      owners = ["099720109477"];
      filters = [
        { Name: "name", Values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"] },
        { Name: "root-device-type", Values: ["ebs"] },
        { Name: "state", Values: ["available"] },
      ];
    } else if (os === "amazon-linux") {
      owners = ["amazon"];
      filters = [
        { Name: "name", Values: ["al2023-ami-2023*-x86_64"] },
        { Name: "root-device-type", Values: ["ebs"] },
        { Name: "state", Values: ["available"] },
      ];
    }

    await this.recordDebug(updateDebug, {
      message: "[STEP] Retrieving AMI",
      awsOperation: "DescribeImages",
      details: { region, accountId, os },
    });
    logger.info("[STEP] Retrieving AMI", { region, accountId, os });

    const response = await this.executeAWSCommand(
      client,
      new DescribeImagesCommand({
        Owners: owners,
        Filters: filters,
      }),
      {
        commandName: "DescribeImages",
        region,
        accountId,
        updateDebug,
        extra: { os },
      }
    );

    const images = response.Images || [];
    images.sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate));
    const latestImage = images[0];

    if (!latestImage) {
      const error = new Error(`No AMI found for ${os} in region ${region}`);
      error.code = "AMI_NOT_FOUND";
      throw error;
    }

    await this.recordDebug(updateDebug, {
      message: "[SUCCESS] AMI Retrieved",
      awsOperation: "DescribeImages",
      details: {
        region,
        accountId,
        os,
        amiId: latestImage.ImageId,
      },
    });
    logger.info("[SUCCESS] AMI Retrieved", {
      region,
      accountId,
      os,
      amiId: latestImage.ImageId,
    });

    return {
      amiId: latestImage.ImageId,
      osName: latestImage.Name,
      architecture: latestImage.Architecture,
      rootDeviceType: latestImage.RootDeviceType,
    };
  }

  /**
   * Wait for instance to reach running state with detailed logging
   */
  async waitForInstanceRunningWithLogging(
    userId,
    encryptedCredentials,
    region,
    accountId,
    instanceId,
    updateStep,
    updateDebug
  ) {
    const stepStartTime = Date.now();
    const maxAttempts = 120; // 10 minutes with 5-second intervals
    let attempts = 0;

    try {
      logger.info("[STEP] Waiting for Running State", {
        instanceId,
        region,
        accountId,
        maxAttempts,
      });

      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      while (attempts < maxAttempts) {
        try {
          const command = new DescribeInstancesCommand({
            InstanceIds: [instanceId],
          });

          const response = await this.executeAWSCommand(
            client,
            command,
            {
              commandName: "DescribeInstances",
              region,
              accountId,
              updateDebug,
              extra: { instanceId, attempt: attempts + 1 },
            }
          );

          const instance = response.Reservations?.[0]?.Instances?.[0];
          const instanceState = instance?.State?.Name;

          logger.info("Instance status check", {
            attempt: attempts + 1,
            instanceId,
            instanceState,
            region,
            accountId,
          });

          if (instanceState === "running") {
            const duration = Date.now() - stepStartTime;
            logger.info("[SUCCESS] Instance Running", {
              instanceId,
              attempts: attempts + 1,
              duration: `${(duration / 1000).toFixed(2)}s`,
            });
            await this.recordDebug(updateDebug, {
              message: "[SUCCESS] Instance Running",
              awsOperation: "DescribeInstances",
              details: {
                region,
                accountId,
                instanceId,
                publicIp: instance.PublicIpAddress,
                publicDns: instance.PublicDnsName,
                privateIp: instance.PrivateIpAddress,
              },
            });

            return {
              instanceId,
              publicIp: instance.PublicIpAddress,
              publicDns: instance.PublicDnsName,
              privateIp: instance.PrivateIpAddress,
            };
          }

          // Still waiting
          await updateStep(
            "waiting_running_state",
            "in_progress",
            `Waiting for instance ready state... (${attempts + 1}/${maxAttempts})`,
            {
              progress: 85 + Math.floor((attempts / maxAttempts) * 5),
            }
          );

          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
        } catch (error) {
          logger.warn("Error during status check, retrying", {
            error: error.message,
            attempt: attempts + 1,
            instanceId,
          });

          // Retry on error
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      throw new Error(
        `Instance did not reach running state within ${Math.floor(
          (maxAttempts * 5) / 60
        )} minutes`
      );
    } catch (error) {
      logger.error("Failed waiting for instance", {
        error: error.message,
        instanceId,
        attemptsCompleted: attempts,
        region,
      });
      throw error;
    }
  }

  /**
   * Execute AWS command with error handling and logging
   */
  async executeAWSCommand(client, command, context) {
    const {
      commandName,
      region,
      accountId,
      vpcId,
      securityGroupName,
      securityGroupId,
      amiId,
      instanceType,
      updateDebug,
      extra = {},
    } = context;
    const startTime = Date.now();
    const timeoutMs = this.awsTimeouts[commandName] || this.awsRequestTimeout;
    const logDetails = {
      region,
      accountId,
      vpcId,
      securityGroupName,
      securityGroupId,
      amiId,
      instanceType,
      timeoutMs,
      ...extra,
    };

    try {
      logger.info(`AWS SDK ${commandName} starting`, logDetails);
      await this.recordDebug(updateDebug, {
        message: `[STEP] AWS SDK ${commandName}`,
        awsOperation: commandName,
        details: logDetails,
      });

      const response = await Promise.race([
        client.send(command),
        new Promise((_, reject) =>
          setTimeout(
            () => {
              const error = new Error(`${commandName} timed out after ${timeoutMs}ms`);
              error.name = "AWSOperationTimeout";
              error.code = "AWS_OPERATION_TIMEOUT";
              reject(error);
            },
            timeoutMs
          )
        ),
      ]);

      const duration = Date.now() - startTime;
      logger.info(`AWS SDK ${commandName} succeeded`, {
        command: commandName,
        duration: `${(duration / 1000).toFixed(2)}s`,
        ...logDetails,
      });
      await this.recordDebug(updateDebug, {
        message: `[SUCCESS] AWS SDK ${commandName}`,
        awsOperation: commandName,
        details: { duration, ...logDetails },
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorCode = error.code || error.name || error.__type || "UNKNOWN";
      logger.error(`AWS SDK ${commandName} failed`, {
        command: commandName,
        errorName: error.name,
        errorCode,
        errorMessage: error.message,
        errorStack: error.stack,
        duration: `${(duration / 1000).toFixed(2)}s`,
        requestId: error.$metadata?.requestId || error.RequestId,
        ...logDetails,
      });
      await this.recordDebug(updateDebug, {
        level: "error",
        message: `[ERROR] AWS SDK ${commandName} failed`,
        awsOperation: commandName,
        details: {
          errorName: error.name,
          errorCode,
          errorMessage: error.message,
          errorStack: error.stack,
          requestId: error.$metadata?.requestId || error.RequestId,
          duration,
          ...logDetails,
        },
      });
      error.code = errorCode;
      error.executionStop = this.getExecutionStop(error);
      throw error;
    }
  }

  async recordDebug(updateDebug, entry) {
    logger.info(entry.message, entry.details);
    if (typeof updateDebug === "function") {
      await updateDebug(entry);
    }
  }

  buildSecurityGroupName(name) {
    return `devops-hub-${String(name || "infrastructure")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 180)}`;
  }

  getExecutionStop(error) {
    const stackLine = String(error?.stack || "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes("enhancedAWSInfrastructureProvisioningService.js"));

    if (!stackLine) {
      return undefined;
    }

    const match = stackLine.match(/at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/)
      || stackLine.match(/at\s+(.*?):(\d+):(\d+)$/);

    if (!match) {
      return { raw: stackLine };
    }

    if (match.length === 5) {
      return {
        method: match[1],
        file: match[2],
        line: Number(match[3]),
        raw: stackLine,
      };
    }

    return {
      file: match[1],
      line: Number(match[2]),
      raw: stackLine,
    };
  }

  /**
   * Get AWS connection
   */
  async getAWSConnection(userId, connectionId) {
    const { AWSConnection } = await import("../models/AWSConnection.js");
    return AWSConnection.findOne({
      _id: connectionId,
      userId,
    });
  }

  /**
   * Get bootstrap script
   */
  getBootstrapScript(os) {
    if (os === "amazon-linux") {
      return this.getAmazonLinuxBootstrapScript();
    }
    return this.getUbuntuBootstrapScript();
  }

  /**
   * Ubuntu 22.04 bootstrap script
   */
  getUbuntuBootstrapScript() {
    return `#!/bin/bash
set -e
exec > >(tee /var/log/devops-hub-bootstrap.log)
exec 2>&1

echo "Starting DevOps Hub bootstrap process..."

# Update system packages
apt-get update
apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
echo "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git and Curl
echo "Installing Git and Curl..."
apt-get install -y git curl wget

# Start Docker service
systemctl start docker
systemctl enable docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Install CloudWatch agent (optional)
apt-get install -y amazon-cloudwatch-agent || true

# Create log directory
mkdir -p /var/log/devops-hub
chmod 755 /var/log/devops-hub

# Verify installations
echo "Verifying installations..."
docker --version
docker-compose --version
git --version
curl --version

echo "✓ Docker daemon running: $(systemctl is-active docker)"
echo "✓ Bootstrap process completed successfully"
echo "Timestamp: $(date)" >> /var/log/devops-hub-bootstrap.log`;
  }

  /**
   * Amazon Linux 2023 bootstrap script
   */
  getAmazonLinuxBootstrapScript() {
    return `#!/bin/bash
set -e
exec > >(tee /var/log/devops-hub-bootstrap.log)
exec 2>&1

echo "Starting DevOps Hub bootstrap process..."

# Update system packages
yum update -y

# Install Docker
echo "Installing Docker..."
yum install -y docker

# Install Docker Compose
echo "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git and Curl
echo "Installing Git and Curl..."
yum install -y git curl wget

# Start Docker service
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Install CloudWatch agent (optional)
yum install -y amazon-cloudwatch-agent || true

# Create log directory
mkdir -p /var/log/devops-hub
chmod 755 /var/log/devops-hub

# Verify installations
echo "Verifying installations..."
docker --version
docker-compose --version
git --version
curl --version

echo "✓ Docker daemon running: $(systemctl is-active docker)"
echo "✓ Bootstrap process completed successfully"
echo "Timestamp: $(date)" >> /var/log/devops-hub-bootstrap.log`;
  }
}

export const enhancedAWSInfrastructureProvisioningService =
  new EnhancedAWSInfrastructureProvisioningService();
