/**
 * AWS Infrastructure Provisioning Service
 * Handles EC2 instance creation, security groups, bootstrapping, and infrastructure lifecycle
 */

import {
  RunInstancesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { awsProviderService } from "./awsProviderService.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { logger } from "../utils/logger.js";
import {
  INSTANCE_TYPE,
  getAwsErrorResponse,
  getConfiguredInstanceType,
  logEC2Launch,
} from "./freeTierInstanceTypes.js";

class AWSInfrastructureProvisioningService {
  constructor() {
    this.bootstrapScripts = {
      ubuntu: this.getUbuntuBootstrapScript,
      "amazon-linux": this.getAmazonLinuxBootstrapScript,
    };
  }

  /**
   * Create infrastructure with EC2 instance and security group
   */
  async createInfrastructure(userId, awsConnectionId, config) {
    const {
      instanceType = INSTANCE_TYPE,
      os = "ubuntu",
      storageSize = 30,
      name = "DevOps-Hub-Instance",
      region,
    } = config;
    const validatedInstanceType = getConfiguredInstanceType(instanceType);

    const startTime = Date.now();

    try {
      // Validate region parameter
      if (!region) {
        throw new Error("Region is required for infrastructure provisioning");
      }

      logger.info("Infrastructure provisioning", {
        step: "Initialization",
        userId,
        instanceType: validatedInstanceType,
        os,
        storageSize,
        name,
        regionCode: region,
        message: `Starting provisioning in region: ${region}`,
      });

      // Get AWS connection and credentials
      const connection = await this.getAWSConnection(userId, awsConnectionId);
      if (!connection) {
        throw new Error("AWS connection not found");
      }

      // Create security group
      logger.info("Infrastructure provisioning", {
        step: "Creating security group",
        userId,
        regionCode: region,
      });
      const securityGroupId = await this.createSecurityGroup(
        userId,
        connection.encryptedCredentials,
        region,
        name
      );

      // Get AMI ID
      logger.info("Infrastructure provisioning", {
        step: "Fetching AMI",
        os,
        regionCode: region,
      });
      const amiInfo = await awsProviderService.getAMIIds(
        userId,
        connection.encryptedCredentials,
        region,
        os === "amazon-linux" ? "amazon-linux" : "ubuntu"
      );

      // Get bootstrap script
      const bootstrapScript = this.getBootstrapScript(os);

      // Create EC2 instance
      logger.info("Infrastructure provisioning", {
        step: "Creating EC2 instance",
        instanceType: validatedInstanceType,
        amiId: amiInfo.amiId,
        regionCode: region,
      });
      const instanceInfo = await this.createInstance(
        userId,
        connection.encryptedCredentials,
        region,
        {
          amiId: amiInfo.amiId,
          instanceType: validatedInstanceType,
          storageSize,
          securityGroupId,
          name,
          bootstrapScript,
          os,
        }
      );

      // Wait for instance to be running
      logger.info("Infrastructure provisioning", {
        step: "Waiting for running state",
        instanceId: instanceInfo.instanceId,
        regionCode: region,
      });
      const runningInstance = await this.waitForInstanceRunning(
        userId,
        connection.encryptedCredentials,
        region,
        instanceInfo.instanceId
      );

      // Save infrastructure metadata to database
      const infrastructure = new AWSInfrastructure({
        userId,
        awsConnectionId,
        instanceId: runningInstance.instanceId,
        instanceType: instanceInfo.instanceType || validatedInstanceType,
        operatingSystem: os,
        storageSize,
        region,
        securityGroupId,
        securityGroupName: securityGroupId,
        publicIp: runningInstance.publicIp,
        privateIp: runningInstance.privateIp,
        tags: {
          Name: name,
          ManagedBy: "DevOpsHub",
          CreatedAt: new Date().toISOString(),
        },
        bootstrapStatus: "pending",
        deploymentStatus: "provisioning",
      });

      await infrastructure.save();

      logger.info("Infrastructure provisioning completed", {
        infrastructureId: infrastructure._id,
        instanceId: runningInstance.instanceId,
        publicIp: runningInstance.publicIp,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        infrastructure: {
          _id: infrastructure._id,
          instanceId: runningInstance.instanceId,
          instanceType: instanceInfo.instanceType || validatedInstanceType,
          operatingSystem: os,
          region,
          publicIp: runningInstance.publicIp,
          privateIp: runningInstance.privateIp,
          securityGroupId,
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
      throw new Error(`Failed to create infrastructure: ${error.message}`);
    }
  }

  /**
   * Create security group with necessary ports open
   */
  async createSecurityGroup(userId, encryptedCredentials, region, name) {
    try {
      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      // Get default VPC
      const vpcCommand = new (await import("@aws-sdk/client-ec2")).DescribeVpcsCommand({
        Filters: [{ Name: "isDefault", Values: ["true"] }],
      });
      const vpcResponse = await client.send(vpcCommand);
      const vpcId = vpcResponse.Vpcs?.[0]?.VpcId;

      if (!vpcId) {
        throw new Error("No default VPC found");
      }

      // Create security group
      const sgCommand = new CreateSecurityGroupCommand({
        GroupName: `devops-hub-${Date.now()}`,
        Description: `DevOps Hub infrastructure security group - ${name}`,
        VpcId: vpcId,
        TagSpecifications: [
          {
            ResourceType: "security-group",
            Tags: [
              { Key: "Name", Value: name },
              { Key: "ManagedBy", Value: "DevOpsHub" },
            ],
          },
        ],
      });

      const sgResponse = await client.send(sgCommand);
      const securityGroupId = sgResponse.GroupId;

      logger.info("Infrastructure provisioning", {
        step: "Security group created",
        securityGroupId,
        regionCode: region,
      });

      // Add ingress rules (SSH, HTTP, HTTPS)
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

        await client.send(ingressCommand);
        logger.info("Infrastructure provisioning", {
          step: "Port authorization",
          port,
          description,
          regionCode: region,
        });
      }

      return securityGroupId;
    } catch (error) {
      logger.error("Failed to create security group", {
        error: error.message,
        regionCode: region,
      });
      throw new Error(`Failed to create security group: ${error.message}`);
    }
  }

  /**
   * Create EC2 instance
   */
  async createInstance(userId, encryptedCredentials, region, config) {
    try {
      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      const { amiId, instanceType, storageSize, securityGroupId, name, bootstrapScript, os } =
        config;
      let launchInstanceType = getConfiguredInstanceType(instanceType);

      const buildRunInstancesCommand = (nextInstanceType) => new RunInstancesCommand({
        ImageId: amiId,
        MinCount: 1,
        MaxCount: 1,
        InstanceType: getConfiguredInstanceType(nextInstanceType),
        SecurityGroupIds: [securityGroupId],
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "Name", Value: name },
              { Key: "ManagedBy", Value: "DevOpsHub" },
              { Key: "CreatedAt", Value: new Date().toISOString() },
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
      let response;
      try {
        response = await client.send(buildRunInstancesCommand(launchInstanceType));
      } catch (error) {
        logger.error("RunInstances failed, retrying once with t3.micro", {
          attemptedInstanceType: launchInstanceType,
          regionCode: region,
          awsError: getAwsErrorResponse(error),
        });
        launchInstanceType = "t3.micro";
        logEC2Launch(launchInstanceType, region);
        response = await client.send(buildRunInstancesCommand(launchInstanceType));
      }
      const instance = response.Instances?.[0];

      if (!instance) {
        throw new Error("No instance returned from AWS");
      }

      logger.info("Infrastructure provisioning", {
        step: "EC2 instance created",
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        regionCode: region,
      });

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
      };
    } catch (error) {
      logger.error("Failed to create EC2 instance", {
        error: error.message,
        regionCode: region,
      });
      throw new Error(`Failed to create instance: ${error.message}`);
    }
  }

  /**
   * Wait for instance to reach running state
   */
  async waitForInstanceRunning(userId, encryptedCredentials, region, instanceId) {
    try {
      const { client } = await awsProviderService.getEC2Client(
        userId,
        encryptedCredentials,
        region
      );

      // Poll for running state with timeout
      const maxAttempts = 60;
      let attempts = 0;

      while (attempts < maxAttempts) {
        const { DescribeInstanceStatusCommand } = await import("@aws-sdk/client-ec2");
        const command = new DescribeInstanceStatusCommand({
          InstanceIds: [instanceId],
          IncludeAllInstances: true,
        });

        const response = await client.send(command);
        const instance = response.InstanceStatuses?.[0];

        if (instance?.InstanceStatus?.Status === "ok") {
          logger.info("Infrastructure provisioning", {
            step: "Instance running and ready",
            instanceId,
            regionCode: region,
          });
          return {
            instanceId,
            publicIp: instance.PublicIpAddress,
            privateIp: instance.PrivateIpAddress,
          };
        }

        logger.info("Infrastructure provisioning", {
          step: "Waiting for instance",
          attempt: `${attempts + 1}/${maxAttempts}`,
          instanceId,
          status: instance?.InstanceStatus?.Status,
          regionCode: region,
        });

        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
      }

      throw new Error("Instance did not reach running state within timeout");
    } catch (error) {
      logger.error("Failed waiting for instance", {
        error: error.message,
        instanceId,
        regionCode: region,
      });
      throw new Error(`Failed to wait for instance: ${error.message}`);
    }
  }

  /**
   * Get AWS connection for user
   */
  async getAWSConnection(userId, connectionId) {
    const { AWSConnection } = await import("../models/AWSConnection.js");
    return AWSConnection.findOne({
      _id: connectionId,
      userId,
    });
  }

  /**
   * Get bootstrap script for OS
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

  /**
   * Terminate infrastructure
   */
  async terminateInfrastructure(userId, infrastructureId) {
    try {
      const infrastructure = await AWSInfrastructure.findOne({
        _id: infrastructureId,
        userId,
      });

      if (!infrastructure) {
        throw new Error("Infrastructure not found");
      }

      // Get AWS connection
      const connection = await this.getAWSConnection(userId, infrastructure.awsConnectionId);
      if (!connection) {
        throw new Error("AWS connection not found");
      }

      const { client } = await awsProviderService.getEC2Client(
        userId,
        connection.encryptedCredentials,
        infrastructure.region
      );

      // Terminate instance
      const { TerminateInstancesCommand } = await import("@aws-sdk/client-ec2");
      const terminateCommand = new TerminateInstancesCommand({
        InstanceIds: [infrastructure.instanceId],
      });

      await client.send(terminateCommand);
      logger.info("Instance termination initiated", {
        instanceId: infrastructure.instanceId,
      });

      // Delete security group (wait a moment for instance termination)
      setTimeout(async () => {
        try {
          const deleteCommand = new DeleteSecurityGroupCommand({
            GroupId: infrastructure.securityGroupId,
          });
          await client.send(deleteCommand);
          logger.info("Security group deleted", {
            securityGroupId: infrastructure.securityGroupId,
          });
        } catch (error) {
          logger.warn("Failed to delete security group", {
            error: error.message,
          });
        }
      }, 10000);

      // Update infrastructure status
      infrastructure.deploymentStatus = "terminated";
      infrastructure.terminationTime = new Date();
      await infrastructure.save();

      return {
        success: true,
        message: "Infrastructure termination initiated",
        infrastructure: infrastructure,
      };
    } catch (error) {
      logger.error("Failed to terminate infrastructure", { error: error.message });
      throw new Error(`Failed to terminate infrastructure: ${error.message}`);
    }
  }

  /**
   * Get infrastructure dashboard data
   */
  async getInfrastructureDashboard(userId, infrastructureId) {
    try {
      const infrastructure = await AWSInfrastructure.findOne({
        _id: infrastructureId,
        userId,
      });

      if (!infrastructure) {
        throw new Error("Infrastructure not found");
      }

      // Get AWS connection
      const connection = await this.getAWSConnection(userId, infrastructure.awsConnectionId);
      if (!connection) {
        throw new Error("AWS connection not found");
      }

      // Get instance details from AWS
      const instanceDetails = await awsProviderService.getInstanceDetails(
        userId,
        connection.encryptedCredentials,
        infrastructure.region,
        infrastructure.instanceId
      );

      return {
        infrastructure: {
          _id: infrastructure._id,
          instanceId: infrastructure.instanceId,
          instanceType: infrastructure.instanceType,
          operatingSystem: infrastructure.operatingSystem,
          region: infrastructure.region,
          storageSize: infrastructure.storageSize,
          publicIp: infrastructure.publicIp,
          privateIp: infrastructure.privateIp,
          status: instanceDetails.state,
          bootstrapStatus: infrastructure.bootstrapStatus,
          deploymentStatus: infrastructure.deploymentStatus,
          createdAt: infrastructure.createdAt,
          tags: infrastructure.tags,
        },
        awsDetails: instanceDetails,
      };
    } catch (error) {
      logger.error("Failed to get infrastructure dashboard", { error: error.message });
      throw new Error(`Failed to get dashboard: ${error.message}`);
    }
  }

  /**
   * Update infrastructure status
   */
  async updateInfrastructureStatus(userId, infrastructureId, updates) {
    try {
      const infrastructure = await AWSInfrastructure.findOneAndUpdate(
        { _id: infrastructureId, userId },
        {
          ...updates,
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!infrastructure) {
        throw new Error("Infrastructure not found");
      }

      return infrastructure;
    } catch (error) {
      logger.error("Failed to update infrastructure status", { error: error.message });
      throw new Error(`Failed to update status: ${error.message}`);
    }
  }
}

export const awsInfrastructureProvisioningService = new AWSInfrastructureProvisioningService();
