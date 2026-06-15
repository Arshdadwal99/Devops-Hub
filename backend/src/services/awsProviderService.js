/**
 * AWS Provider Service
 * Manages AWS SDK initialization, credential validation, and account information retrieval
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeInstanceStatusCommand,
  DescribeImagesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  TerminateInstancesCommand,
  DeleteSecurityGroupCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
} from "@aws-sdk/client-ec2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { encryptSecret, decryptSecret } from "./credentialEncryptionService.js";
import { logger } from "../utils/logger.js";

// Valid AWS regions
const VALID_AWS_REGIONS = [
  // US Regions
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  // Europe Regions
  "eu-west-1",
  "eu-central-1",
  "eu-west-2",
  "eu-west-3",
  // Asia Pacific Regions
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  // Canada
  "ca-central-1",
  // South America
  "sa-east-1",
];

class AWSProviderService {
  constructor() {
    this.clients = new Map(); // Map of user-specific clients
    this.accountCache = new Map(); // Cache for account information
  }

  /**
   * Validate AWS region code
   */
  validateRegion(region) {
    if (!region || typeof region !== "string") {
      throw new Error("Region code must be a non-empty string");
    }

    const trimmedRegion = region.trim();
    if (!VALID_AWS_REGIONS.includes(trimmedRegion)) {
      throw new Error(
        `Invalid AWS region: ${trimmedRegion}. Must be one of: ${VALID_AWS_REGIONS.join(", ")}`
      );
    }

    return trimmedRegion;
  }

  /**
   * Validate AWS credentials with detailed debugging
   */
  async validateCredentials(accessKeyId, secretAccessKey, region) {
    const logContext = {
      accessKeyPrefix: accessKeyId ? accessKeyId.substring(0, 4) + "***" : "MISSING",
      secretKeyPrefix: secretAccessKey ? secretAccessKey.substring(0, 4) + "***" : "MISSING",
      region: region,
      timestamp: new Date().toISOString(),
    };

    try {
      logger.info("AWS Credential Validation", {
        step: "Starting validation",
        ...logContext,
        message: "Validating AWS credentials",
      });

      // Input validation
      if (!accessKeyId || !secretAccessKey || !region) {
        const missingFields = [];
        if (!accessKeyId) missingFields.push("accessKeyId");
        if (!secretAccessKey) missingFields.push("secretAccessKey");
        if (!region) missingFields.push("region");
        
        const error = new Error(`Missing required fields: ${missingFields.join(", ")}`);
        error.code = "MISSING_CREDENTIALS";
        throw error;
      }

      logger.info("AWS Credential Validation", {
        step: "Input validation",
        ...logContext,
        message: "All required fields present",
      });

      // Validate and normalize region code
      const validatedRegion = this.validateRegion(region);
      logContext.region = validatedRegion;

      logger.info("AWS Credential Validation", {
        step: "Region validation",
        ...logContext,
        regionCode: validatedRegion,
        message: `Valid region code: ${validatedRegion}`,
      });

      // Prepare credentials
      const trimmedAccessKey = accessKeyId.trim();
      const trimmedSecretKey = secretAccessKey.trim();

      logger.info("AWS Credential Validation", {
        step: "Credential preparation",
        ...logContext,
        message: "Credentials trimmed and ready",
      });

      // Initialize STS client
      let stsClient;
      try {
        logger.info("AWS Credential Validation", {
          step: "AWS SDK initialization",
          ...logContext,
          regionCode: validatedRegion,
          message: `Initializing STSClient with credentials for region: ${validatedRegion}`,
        });

        stsClient = new STSClient({
          region: validatedRegion,
          credentials: {
            accessKeyId: trimmedAccessKey,
            secretAccessKey: trimmedSecretKey,
          },
        });

        logger.info("AWS Credential Validation", {
          step: "STS client created",
          ...logContext,
          regionCode: validatedRegion,
          message: "STSClient initialized successfully",
        });
      } catch (initError) {
        const errorMsg = initError.message || "Unknown initialization error";
        logger.error("AWS SDK Initialization Failed", {
          step: "AWS SDK initialization",
          error: errorMsg,
          errorCode: initError.code || "UNKNOWN",
          errorName: initError.name || "UnknownError",
          ...logContext,
          message: `Failed to initialize STSClient: ${errorMsg}`,
          stack: initError.stack,
        });

        const err = new Error("AWS SDK initialization failed");
        err.code = "SDK_INIT_FAILED";
        err.originalError = errorMsg;
        throw err;
      }

      // Make STS GetCallerIdentity request
      let response;
      try {
        logger.info("AWS Credential Validation", {
          step: "STS GetCallerIdentity request",
          ...logContext,
          regionCode: validatedRegion,
          message: "Sending GetCallerIdentity request to AWS",
        });

        const command = new GetCallerIdentityCommand({});
        response = await stsClient.send(command);

        logger.info("AWS Credential Validation", {
          step: "STS request successful",
          accountId: response.Account,
          userId: response.UserId,
          arn: response.Arn,
          ...logContext,
          regionCode: validatedRegion,
          message: `Successfully retrieved AWS account info for account: ${response.Account}`,
        });
      } catch (stsError) {
        const errorMsg = stsError.message || "Unknown STS error";
        const errorCode = stsError.code || stsError.name || "UNKNOWN";

        logger.error("AWS STS Request Failed", {
          step: "STS GetCallerIdentity request",
          error: errorMsg,
          errorCode: errorCode,
          errorName: stsError.name || "UnknownError",
          ...logContext,
          regionCode: validatedRegion,
          message: `STS GetCallerIdentity failed: ${errorMsg}`,
          stack: stsError.stack,
          requestId: stsError.$metadata?.requestId || "UNKNOWN",
        });

        // Classify the error
        let errorType = "UNKNOWN_ERROR";
        if (errorCode === "InvalidClientTokenId") {
          errorType = "INVALID_ACCESS_KEY";
        } else if (errorCode === "SignatureDoesNotMatch") {
          errorType = "INVALID_SECRET_KEY";
        } else if (errorCode === "AccessDenied" || errorCode === "UnauthorizedOperation") {
          errorType = "ACCESS_DENIED";
        } else if (errorCode === "InvalidParameterValue") {
          errorType = "INVALID_REGION";
        } else if (errorCode === "RequestLimitExceeded") {
          errorType = "REQUEST_LIMIT_EXCEEDED";
        } else if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("ENOTFOUND")) {
          errorType = "NETWORK_ERROR";
        }

        const err = new Error(errorMsg);
        err.code = errorCode;
        err.type = errorType;
        err.originalError = stsError;
        throw err;
      }

      logger.info("AWS Credential Validation", {
        step: "Validation complete",
        accountId: response.Account,
        ...logContext,
        regionCode: validatedRegion,
        message: "AWS credentials validated successfully",
      });

      return {
        valid: true,
        accountId: response.Account,
        userId: response.UserId,
        arn: response.Arn,
        region: validatedRegion,
      };
    } catch (error) {
      const errorCode = error.code || "UNKNOWN";
      const errorMessage = error.message || "Unknown error";
      
      // Map error codes to user-friendly messages and types
      let userFriendlyError = errorMessage;
      let errorType = "UNKNOWN_ERROR";

      if (errorCode === "MISSING_CREDENTIALS") {
        userFriendlyError = "Missing AWS credentials. Please provide Access Key ID, Secret Access Key, and Region.";
        errorType = "MISSING_CREDENTIALS";
      } else if (errorCode === "SDK_INIT_FAILED") {
        userFriendlyError = "Failed to initialize AWS SDK. Please check your region and try again.";
        errorType = "AWS_SDK_INITIALIZATION_FAILED";
      } else if (errorCode === "InvalidClientTokenId" || errorCode.includes("InvalidClientTokenId")) {
        userFriendlyError = "Invalid AWS Access Key ID. Please verify your access key is correct.";
        errorType = "INVALID_ACCESS_KEY";
      } else if (errorCode === "SignatureDoesNotMatch" || errorCode.includes("SignatureDoesNotMatch")) {
        userFriendlyError = "Invalid AWS Secret Access Key. Please verify your secret key is correct.";
        errorType = "INVALID_SECRET_KEY";
      } else if (errorCode === "AccessDenied" || errorCode === "UnauthorizedOperation" || errorCode.includes("AccessDenied")) {
        userFriendlyError = "Access denied. Your AWS credentials do not have permission to use STS GetCallerIdentity. Ensure the IAM user/role has appropriate permissions.";
        errorType = "ACCESS_DENIED";
      } else if (errorCode === "InvalidParameterValue" || errorCode.includes("InvalidRegion")) {
        userFriendlyError = `Invalid AWS region: ${region}. Please select a valid region.`;
        errorType = "INVALID_REGION";
      } else if (errorCode === "RequestLimitExceeded") {
        userFriendlyError = "AWS request limit exceeded. Please wait a moment and try again.";
        errorType = "REQUEST_LIMIT_EXCEEDED";
      } else if (errorCode.includes("ECONNREFUSED") || errorCode.includes("ETIMEDOUT") || errorCode.includes("ENOTFOUND")) {
        userFriendlyError = "Network connectivity issue. Unable to reach AWS services. Please check your internet connection.";
        errorType = "NETWORK_ERROR";
      }

      logger.error("AWS Credential Validation Failed", {
        step: "Validation failed",
        error: errorMessage,
        errorCode: errorCode,
        errorType: errorType,
        ...logContext,
        message: userFriendlyError,
        stack: error.stack,
        originalError: error.originalError?.message || "N/A",
      });
      
      const err = new Error(userFriendlyError);
      err.code = errorCode;
      err.type = errorType;
      throw err;
    }
  }

  /**
   * Get or create EC2 client for user
   */
  async getEC2Client(userId, encryptedCredentials, region) {
    const validatedRegion = this.validateRegion(region);
    const cacheKey = `${userId}:${validatedRegion}`;

    logger.info("AWS EC2 Client", {
      step: "Client retrieval",
      userId,
      regionCode: validatedRegion,
      cached: this.clients.has(cacheKey),
    });

    // Return cached client if available
    if (this.clients.has(cacheKey)) {
      logger.debug("Using cached EC2 client", { userId, region: validatedRegion });
      return this.clients.get(cacheKey);
    }

    try {
      // Decrypt credentials
      if (!encryptedCredentials || !encryptedCredentials.accessKeyId || !encryptedCredentials.secretAccessKey) {
        throw new Error("Encrypted credentials are missing or incomplete");
      }

      logger.info("AWS EC2 Client", {
        step: "Credential decryption start",
        userId,
        regionCode: validatedRegion,
        accessKeyIdStructure: encryptedCredentials.accessKeyId ? Object.keys(encryptedCredentials.accessKeyId) : "MISSING",
      });

      const credentials = {
        accessKeyId: decryptSecret(encryptedCredentials.accessKeyId),
        secretAccessKey: decryptSecret(encryptedCredentials.secretAccessKey),
      };

      logger.info("AWS EC2 Client", {
        step: "Credential decryption success",
        userId,
        regionCode: validatedRegion,
        message: "Credentials decrypted successfully",
      });

      logger.info("AWS EC2 Client", {
        step: "Client initialization",
        userId,
        regionCode: validatedRegion,
        message: `Creating new EC2Client with region: ${validatedRegion}`,
      });

      const client = new EC2Client({
        region: validatedRegion,
        credentials,
      });

      // Cache the client
      this.clients.set(cacheKey, { client, credentials, region: validatedRegion });

      logger.info("AWS EC2 Client", {
        step: "Client created",
        userId,
        regionCode: validatedRegion,
        message: "EC2Client initialized successfully",
      });

      return this.clients.get(cacheKey);
    } catch (error) {
      logger.error("Failed to create EC2 client", {
        step: "ec2_client_creation_failed",
        error: error.message,
        userId,
        region: validatedRegion,
        stackTrace: error.stack,
      });
      throw new Error(`Failed to initialize AWS connection: ${error.message}`);
    }
  }

  /**
   * Get STS client for account information
   */
  async getSTSClient(userId, encryptedCredentials, region) {
    try {
      if (!encryptedCredentials || !encryptedCredentials.accessKeyId || !encryptedCredentials.secretAccessKey) {
        throw new Error("Encrypted credentials are missing or incomplete");
      }

      logger.info("AWS STS Client", {
        step: "Credential decryption start",
        userId,
        regionCode: region,
      });

      const credentials = {
        accessKeyId: decryptSecret(encryptedCredentials.accessKeyId),
        secretAccessKey: decryptSecret(encryptedCredentials.secretAccessKey),
      };

      logger.info("AWS STS Client", {
        step: "Credential decryption success",
        userId,
        regionCode: region,
        message: "Credentials decrypted for STS client",
      });

      return new STSClient({
        region,
        credentials,
      });
    } catch (error) {
      logger.error("Failed to create STS client", {
        step: "sts_client_creation_failed",
        error: error.message,
        stackTrace: error.stack,
      });
      throw new Error(`Failed to initialize AWS STS: ${error.message}`);
    }
  }

  /**
   * Get AWS account information
   */
  async getAccountInfo(userId, encryptedCredentials, region) {
    const cacheKey = `${userId}:account`;

    // Return cached account info if available
    if (this.accountCache.has(cacheKey)) {
      return this.accountCache.get(cacheKey);
    }

    try {
      const stsClient = await this.getSTSClient(userId, encryptedCredentials, region);
      const command = new GetCallerIdentityCommand({});
      const response = await stsClient.send(command);

      const accountInfo = {
        accountId: response.Account,
        userId: response.UserId,
        arn: response.Arn,
        region,
      };

      // Cache for 1 hour
      this.accountCache.set(cacheKey, accountInfo);
      setTimeout(() => this.accountCache.delete(cacheKey), 3600000);

      return accountInfo;
    } catch (error) {
      logger.error("Failed to get account information", { error: error.message });
      throw new Error(`Failed to retrieve account information: ${error.message}`);
    }
  }

  /**
   * List EC2 instances for user
   */
  async listInstances(userId, encryptedCredentials, region) {
    try {
      const { client } = await this.getEC2Client(userId, encryptedCredentials, region);
      const command = new DescribeInstancesCommand({});
      const response = await client.send(command);

      const instances = [];
      for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) {
          instances.push({
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            state: instance.State.Name,
            publicIp: instance.PublicIpAddress,
            privateIp: instance.PrivateIpAddress,
            launchTime: instance.LaunchTime,
            tags: this.parseTags(instance.Tags),
            keyName: instance.KeyName,
            securityGroups: instance.SecurityGroups,
          });
        }
      }

      logger.info(`Retrieved ${instances.length} EC2 instances for user`, { userId });
      return instances;
    } catch (error) {
      logger.error("Failed to list EC2 instances", { error: error.message });
      throw new Error(`Failed to list instances: ${error.message}`);
    }
  }

  /**
   * Get instance details
   */
  async getInstanceDetails(userId, encryptedCredentials, region, instanceId) {
    try {
      const { client } = await this.getEC2Client(userId, encryptedCredentials, region);
      const command = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      });
      const response = await client.send(command);

      if (!response.Reservations || response.Reservations.length === 0) {
        throw new Error("Instance not found");
      }

      const instance = response.Reservations[0].Instances[0];

      // Get instance status
      const statusCommand = new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
        IncludeAllInstances: true,
      });
      const statusResponse = await client.send(statusCommand);
      const instanceStatus = statusResponse.InstanceStatuses?.[0];

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State.Name,
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
        launchTime: instance.LaunchTime,
        tags: this.parseTags(instance.Tags),
        keyName: instance.KeyName,
        securityGroups: instance.SecurityGroups,
        vpcId: instance.VpcId,
        subnetId: instance.SubnetId,
        monitoring: {
          state: instance.Monitoring?.State,
          instanceStatus: instanceStatus?.InstanceStatus?.Status,
          systemStatus: instanceStatus?.SystemStatus?.Status,
        },
      };
    } catch (error) {
      logger.error("Failed to get instance details", { error: error.message });
      throw new Error(`Failed to get instance details: ${error.message}`);
    }
  }

  /**
   * Get available AMI IDs for specified OS
   */
  async getAMIIds(userId, encryptedCredentials, region, os) {
    try {
      const { client } = await this.getEC2Client(userId, encryptedCredentials, region);

      let filters = [];
      if (os === "ubuntu") {
        filters = [
          { Name: "name", Values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"] },
          { Name: "root-device-type", Values: ["ebs"] },
          { Name: "state", Values: ["available"] },
        ];
      } else if (os === "amazon-linux") {
        filters = [
          { Name: "name", Values: ["al2023-ami-*"] },
          { Name: "root-device-type", Values: ["ebs"] },
          { Name: "state", Values: ["available"] },
        ];
      }

      const command = new DescribeImagesCommand({
        Owners: ["099720109477"], // Canonical for Ubuntu, AWS for Amazon Linux
        Filters: filters,
      });

      const response = await client.send(command);
      const images = response.Images || [];

      // Sort by creation date and get latest
      images.sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate));
      const latestImage = images[0];

      if (!latestImage) {
        throw new Error(`No AMI found for ${os} in region ${region}`);
      }

      return {
        amiId: latestImage.ImageId,
        osName: latestImage.Name,
        architecture: latestImage.Architecture,
        rootDeviceType: latestImage.RootDeviceType,
      };
    } catch (error) {
      logger.error("Failed to get AMI IDs", { error: error.message });
      throw new Error(`Failed to get AMI: ${error.message}`);
    }
  }

  /**
   * Parse tags from AWS response
   */
  parseTags(tags) {
    if (!tags) return {};
    const result = {};
    for (const tag of tags) {
      result[tag.Key] = tag.Value;
    }
    return result;
  }

  /**
   * Create tags object for AWS
   */
  createTagsObject(tags) {
    if (!tags) return [];
    return Object.entries(tags).map(([key, value]) => ({
      Key: key,
      Value: value,
    }));
  }

  /**
   * Clear client cache for user
   */
  clearClientCache(userId) {
    const keysToDelete = [];
    for (const [key] of this.clients) {
      if (key.startsWith(userId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.clients.delete(key));
    this.accountCache.delete(`${userId}:account`);
    logger.info("Cleared AWS client cache for user", { userId });
  }

  /**
   * Disconnect and remove all user credentials
   */
  async disconnect(userId) {
    this.clearClientCache(userId);
    logger.info("AWS connection disconnected for user", { userId });
  }
}

export const awsProviderService = new AWSProviderService();
