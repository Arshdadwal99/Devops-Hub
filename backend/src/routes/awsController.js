/**
 * AWS Infrastructure Controller
 * Handles API requests for AWS infrastructure management
 */

import { awsProviderService } from "../services/awsProviderService.js";
import { awsInfrastructureProvisioningService } from "../services/awsInfrastructureProvisioningService.js";
import { enhancedAWSInfrastructureProvisioningService } from "../services/enhancedAWSInfrastructureProvisioningService.js";
import { provisioningJobQueue } from "../services/provisioningJobQueue.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { ProvisioningJob } from "../models/ProvisioningJob.js";
import { encryptSecret } from "../services/credentialEncryptionService.js";
import { logger } from "../utils/logger.js";
import { getConfiguredInstanceType } from "../services/freeTierInstanceTypes.js";
import mongoose from "mongoose";
import {
  RebootInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";

/**
 * Connect to AWS account
 * POST /api/aws/connect
 */
export const connectAWS = async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  const startTime = Date.now();

  try {
    const { userId } = req.user;
    const { accessKeyId, secretAccessKey, region, connectionName } = req.body;

    // Log request payload (without secrets)
    const requestPayload = {
      connectionName: connectionName || "MISSING",
      region: region || "MISSING",
      accessKeyIdLength: accessKeyId ? accessKeyId.length : 0,
      accessKeyPrefix: accessKeyId ? accessKeyId.substring(0, 4) + "***" : "MISSING",
      secretAccessKeyLength: secretAccessKey ? secretAccessKey.length : 0,
      secretAccessKeyPrefix: secretAccessKey ? secretAccessKey.substring(0, 4) + "***" : "MISSING",
    };

    logger.info("POST /api/aws/connect - Request received", {
      requestId,
      userId,
      step: "request_received",
      payload: requestPayload,
      message: "AWS connection request received",
    });

    // Validate input
    if (!accessKeyId || !secretAccessKey || !region || !connectionName) {
      const missingFields = [];
      if (!accessKeyId) missingFields.push("accessKeyId");
      if (!secretAccessKey) missingFields.push("secretAccessKey");
      if (!region) missingFields.push("region");
      if (!connectionName) missingFields.push("connectionName");

      logger.warn("POST /api/aws/connect - Input validation failed", {
        requestId,
        userId,
        step: "input_validation_failed",
        missingFields,
        providedFields: Object.keys(req.body).filter(k => k !== 'secretAccessKey'),
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });

      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: `Required fields: ${missingFields.join(", ")}`,
        failureType: "INPUT_VALIDATION_ERROR",
        requestId,
      });
    }

    // Validate region code format
    const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
    if (!regionRegex.test(region)) {
      logger.warn("POST /api/aws/connect - Region validation failed", {
        requestId,
        userId,
        step: "region_validation_failed",
        regionCode: region,
        regionRegex: regionRegex.toString(),
        message: `Invalid region format: ${region}`,
      });

      return res.status(400).json({
        success: false,
        error: "Invalid region format",
        details: `Region must be a valid AWS region code like 'us-east-1'. Received: '${region}'`,
        failureType: "INVALID_REGION_FORMAT",
        requestId,
      });
    }

    logger.info("POST /api/aws/connect - Validations passed", {
      requestId,
      userId,
      step: "input_validation_passed",
      connectionName,
      region,
      message: "All input validations passed successfully",
    });

    // Validate credentials and region
    let validation;
    try {
      logger.info("POST /api/aws/connect - Starting credential validation", {
        requestId,
        userId,
        step: "aws_credential_validation_start",
        region,
        accessKeyPrefix: accessKeyId.substring(0, 4) + "***",
        message: "Starting AWS credential validation (STS GetCallerIdentity)",
      });

      validation = await awsProviderService.validateCredentials(
        accessKeyId,
        secretAccessKey,
        region
      );

      logger.info("POST /api/aws/connect - Credentials validated", {
        requestId,
        userId,
        step: "aws_credential_validation_success",
        accountId: validation.accountId,
        arn: validation.arn,
        userId: validation.userId,
        region,
        message: `Successfully validated credentials for AWS Account ${validation.accountId}`,
      });
    } catch (credentialError) {
      const errorMessage = credentialError.message || "Unknown credential validation error";
      const errorCode = credentialError.code || "UNKNOWN";
      const errorType = credentialError.type || "UNKNOWN_ERROR";
      const originalError = credentialError.originalError?.message || credentialError.originalError || "N/A";

      logger.error("POST /api/aws/connect - Credential validation failed", {
        requestId,
        userId,
        step: "aws_credential_validation_failed",
        error: errorMessage,
        errorCode: errorCode,
        errorType: errorType,
        originalError: originalError,
        region,
        connectionName,
        accessKeyPrefix: accessKeyId.substring(0, 4) + "***",
        stackTrace: credentialError.stack,
        message: `AWS credential validation failed: ${errorMessage} (${errorCode})`,
      });

      // Return detailed error response based on error type
      const statusCode = ["INVALID_REGION", "INVALID_REGION_FORMAT"].includes(errorType) ? 400 : 401;
      const failureType = mapErrorToFailureType(errorType);

      return res.status(statusCode).json({
        success: false,
        error: getErrorTitle(errorType),
        details: errorMessage,
        failureType: failureType,
        errorCode: errorCode,
        errorType: errorType,
        requestId,
        duration: Date.now() - startTime,
      });
    }

    if (!validation || !validation.valid) {
      const validationError = validation?.error || "Credentials could not be validated";
      
      logger.warn("POST /api/aws/connect - Validation result invalid", {
        requestId,
        userId,
        step: "validation_result_invalid",
        validation: {
          valid: validation?.valid,
          error: validationError,
        },
        message: `Credential validation returned invalid: ${validationError}`,
      });

      return res.status(401).json({
        success: false,
        error: "Invalid AWS credentials",
        details: validationError,
        failureType: "INVALID_CREDENTIALS",
        requestId,
        duration: Date.now() - startTime,
      });
    }

    // Get account information
    let accountInfo;
    try {
      logger.info("POST /api/aws/connect - Retrieving account info", {
        requestId,
        userId,
        step: "account_info_retrieval_start",
        accountId: validation.accountId,
        region,
        message: "Retrieving AWS account information",
      });

      accountInfo = await awsProviderService.getAccountInfo(
        userId,
        {
          accessKeyId: encryptSecret(accessKeyId),
          secretAccessKey: encryptSecret(secretAccessKey),
        },
        validation.region
      );

      logger.info("POST /api/aws/connect - Account info retrieved", {
        requestId,
        userId,
        step: "account_info_retrieval_success",
        accountId: validation.accountId,
        accountName: accountInfo?.accountName,
        region,
        message: `Successfully retrieved account information for ${validation.accountId}`,
      });
    } catch (accountError) {
      const errorMessage = accountError.message || "Failed to retrieve account information";
      const errorCode = accountError.code || "UNKNOWN";

      logger.error("POST /api/aws/connect - Account info retrieval failed", {
        requestId,
        userId,
        step: "account_info_retrieval_failed",
        error: errorMessage,
        errorCode: errorCode,
        accountId: validation.accountId,
        region,
        stackTrace: accountError.stack,
        message: `Failed to retrieve account information: ${errorMessage}`,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to retrieve account information",
        details: errorMessage,
        failureType: "ACCOUNT_INFO_RETRIEVAL_FAILED",
        accountId: validation.accountId,
        requestId,
        duration: Date.now() - startTime,
      });
    }

    // Check if connection already exists
    let connection = await AWSConnection.findOne({
      userId,
      connectionName,
    });

    if (connection) {
      logger.info("POST /api/aws/connect - Updating existing connection", {
        requestId,
        userId,
        step: "connection_update_start",
        connectionId: connection._id,
        connectionName,
        accountId: accountInfo.accountId,
        message: "Updating existing AWS connection record",
      });

      // Update existing connection
      connection.encryptedCredentials = {
        accessKeyId: encryptSecret(accessKeyId),
        secretAccessKey: encryptSecret(secretAccessKey),
      };
      connection.region = validation.region;
      connection.accountId = accountInfo.accountId;
      connection.accountArn = accountInfo.arn;
      connection.connected = true;
      connection.validatedAt = new Date();
      connection.clearError();

      logger.info("POST /api/aws/connect - Existing connection updated", {
        requestId,
        userId,
        step: "connection_update_complete",
        connectionId: connection._id,
        message: "Connection record updated successfully",
      });
    } else {
      logger.info("POST /api/aws/connect - Creating new connection", {
        requestId,
        userId,
        step: "connection_create_start",
        connectionName,
        accountId: validation.accountId,
        message: "Creating new AWS connection record",
      });

      // Create new connection
      connection = new AWSConnection({
        userId,
        connectionName,
        encryptedCredentials: {
          accessKeyId: encryptSecret(accessKeyId),
          secretAccessKey: encryptSecret(secretAccessKey),
        },
        region: validation.region,
        accountId: accountInfo.accountId,
        accountArn: accountInfo.arn,
        accountName: `AWS Account ${accountInfo.accountId}`,
        connected: true,
        validatedAt: new Date(),
      });

      logger.info("POST /api/aws/connect - New connection record created", {
        requestId,
        userId,
        step: "connection_create_complete",
        connectionName,
        message: "New connection object prepared for saving",
      });
    }

    await connection.save();

    logger.info("POST /api/aws/connect - Success", {
      requestId,
      userId,
      step: "connection_save_success",
      connectionId: connection._id,
      accountId: accountInfo.accountId,
      accountArn: accountInfo.arn,
      region: validation.region,
      connectionName,
      duration: Date.now() - startTime,
      message: `Successfully connected to AWS Account ${accountInfo.accountId} (${accountInfo.arn}) in region ${validation.region}`,
    });

    res.json({
      success: true,
      connection: {
        _id: connection._id,
        connectionName: connection.connectionName,
        region: connection.region,
        accountId: connection.accountId,
        accountName: connection.accountName,
        connected: connection.connected,
        validatedAt: connection.validatedAt,
      },
      accountInfo,
      requestId,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error.message || "Unknown error";

    logger.error("POST /api/aws/connect - Unexpected error", {
      requestId,
      step: "unexpected_error",
      error: errorMessage,
      errorCode: error.code || "UNKNOWN",
      errorName: error.name || "Error",
      stackTrace: error.stack,
      duration: Date.now() - startTime,
      message: `Unexpected error during AWS connection: ${errorMessage}`,
    });

    res.status(500).json({
      success: false,
      error: "Failed to connect to AWS account",
      details: errorMessage,
      failureType: "UNEXPECTED_ERROR",
      requestId,
      duration: Date.now() - startTime,
    });
  }
};

/**
 * Map error types to user-friendly failure types
 */
function mapErrorToFailureType(errorType) {
  const typeMap = {
    INVALID_ACCESS_KEY: "INVALID_ACCESS_KEY",
    INVALID_SECRET_KEY: "INVALID_SECRET_KEY",
    ACCESS_DENIED: "ACCESS_DENIED",
    INVALID_REGION: "INVALID_REGION",
    REQUEST_LIMIT_EXCEEDED: "REQUEST_LIMIT_EXCEEDED",
    NETWORK_ERROR: "NETWORK_CONNECTIVITY_ISSUE",
    AWS_SDK_INITIALIZATION_FAILED: "AWS_SDK_INITIALIZATION_FAILED",
    STS_REQUEST_FAILED: "STS_REQUEST_FAILED",
    MISSING_CREDENTIALS: "MISSING_CREDENTIALS",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
  };
  return typeMap[errorType] || "UNKNOWN_ERROR";
}

/**
 * Get user-friendly error title for error type
 */
function getErrorTitle(errorType) {
  const titleMap = {
    INVALID_ACCESS_KEY: "Invalid AWS Access Key ID",
    INVALID_SECRET_KEY: "Invalid AWS Secret Access Key",
    ACCESS_DENIED: "Access Denied",
    INVALID_REGION: "Invalid Region",
    REQUEST_LIMIT_EXCEEDED: "Request Limit Exceeded",
    NETWORK_ERROR: "Network Connectivity Issue",
    AWS_SDK_INITIALIZATION_FAILED: "AWS SDK Initialization Failed",
    STS_REQUEST_FAILED: "AWS Authentication Failed",
    MISSING_CREDENTIALS: "Missing Credentials",
    UNKNOWN_ERROR: "Authentication Failed",
  };
  return titleMap[errorType] || "AWS Connection Failed";
}

function buildInfrastructureLookup(userId, id) {
  const filters = [{ instanceId: id }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    filters.push({ _id: id });
  }
  return { userId, $or: filters };
}

function getMapValue(mapLike, key) {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === "function") return mapLike.get(key);
  return mapLike[key];
}

function toConsoleUrl(region, instanceId) {
  return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${instanceId}`;
}

function toPublicInstance(infrastructure, liveDetails = null, connection = null) {
  const plain = typeof infrastructure.toObject === "function"
    ? infrastructure.toObject()
    : infrastructure;
  const state = liveDetails?.state || plain.ec2Status || "unknown";
  const name = liveDetails?.tags?.Name || getMapValue(plain.tags, "Name") || plain.instanceId;
  const connectionPlain = connection && typeof connection.toObject === "function"
    ? connection.toObject()
    : connection;

  return {
    id: String(plain._id),
    infrastructureId: String(plain._id),
    awsConnectionId: String(plain.awsConnectionId?._id || plain.awsConnectionId || ""),
    connectionName: connectionPlain?.connectionName || plain.awsConnectionId?.connectionName || "",
    accountId: connectionPlain?.accountId || plain.awsConnectionId?.accountId || "",
    instanceName: name,
    instanceId: plain.instanceId,
    publicIp: liveDetails?.publicIp || plain.publicIp || "",
    privateIp: liveDetails?.privateIp || plain.privateIp || "",
    region: plain.region,
    instanceType: liveDetails?.instanceType || plain.instanceType,
    state,
    launchTime: liveDetails?.launchTime || plain.createdAt,
    deploymentStatus: plain.deploymentStatus,
    bootstrapStatus: plain.bootstrapStatus,
    operatingSystem: plain.operatingSystem,
    storageSize: plain.storageSize,
    securityGroupId: liveDetails?.securityGroups?.[0]?.GroupId || plain.securityGroupId,
    securityGroupName: liveDetails?.securityGroups?.[0]?.GroupName || plain.securityGroupName,
    securityGroups: liveDetails?.securityGroups || [],
    vpcId: liveDetails?.vpcId || plain.vpcId,
    subnetId: liveDetails?.subnetId || plain.subnetId,
    tags: plain.tags,
    deployment: plain.deployment,
    auditLog: plain.auditLog || [],
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    awsConsoleUrl: toConsoleUrl(plain.region, plain.instanceId),
  };
}

function toPublicAWSInstance(liveInstance, connection) {
  const tags = liveInstance.tags || {};
  return {
    id: liveInstance.instanceId,
    infrastructureId: null,
    awsConnectionId: String(connection._id),
    connectionName: connection.connectionName,
    accountId: connection.accountId,
    instanceName: tags.Name || liveInstance.instanceId,
    instanceId: liveInstance.instanceId,
    publicIp: liveInstance.publicIp || "",
    privateIp: liveInstance.privateIp || "",
    region: connection.region,
    instanceType: liveInstance.instanceType,
    state: liveInstance.state || "unknown",
    launchTime: liveInstance.launchTime,
    deploymentStatus: "discovered",
    bootstrapStatus: "unknown",
    operatingSystem: "",
    storageSize: null,
    securityGroupId: liveInstance.securityGroups?.[0]?.GroupId || "",
    securityGroupName: liveInstance.securityGroups?.[0]?.GroupName || "",
    securityGroups: liveInstance.securityGroups || [],
    vpcId: liveInstance.vpcId || "",
    subnetId: liveInstance.subnetId || "",
    tags,
    keyName: liveInstance.keyName,
    createdAt: liveInstance.launchTime,
    updatedAt: liveInstance.launchTime,
    awsConsoleUrl: toConsoleUrl(connection.region, liveInstance.instanceId),
  };
}

async function getInfrastructureWithConnection(userId, id) {
  const infrastructure = await AWSInfrastructure.findOne(buildInfrastructureLookup(userId, id));
  if (!infrastructure) {
    const error = new Error("Instance not found");
    error.statusCode = 404;
    throw error;
  }

  const connection = await AWSConnection.findOne({
    _id: infrastructure.awsConnectionId,
    userId,
    connected: true,
  });
  if (!connection) {
    const error = new Error("AWS connection not found or inactive");
    error.statusCode = 404;
    throw error;
  }

  return { infrastructure, connection };
}

async function fetchLiveInstanceDetails(userId, infrastructure, connection) {
  try {
    return await awsProviderService.getInstanceDetails(
      userId,
      connection.encryptedCredentials,
      infrastructure.region,
      infrastructure.instanceId
    );
  } catch (error) {
    logger.warn("Live EC2 details unavailable; using stored metadata", {
      instanceId: infrastructure.instanceId,
      region: infrastructure.region,
      error: error.message,
    });
    return null;
  }
}

async function findLiveInstanceConnection(userId, id) {
  const connections = await AWSConnection.find({ userId, connected: true });
  for (const connection of connections) {
    try {
      const instances = await awsProviderService.listInstances(
        userId,
        connection.encryptedCredentials,
        connection.region
      );
      const liveInstance = instances.find((instance) => instance.instanceId === id);
      if (liveInstance) {
        return { connection, liveInstance };
      }
    } catch (error) {
      logger.warn("Unable to search AWS connection for instance", {
        connectionId: connection._id,
        region: connection.region,
        instanceId: id,
        error: error.message,
      });
    }
  }
  return null;
}

async function applyInstanceAction(userId, id, action, CommandClass, nextStatus) {
  let infrastructure;
  let connection;

  try {
    ({ infrastructure, connection } = await getInfrastructureWithConnection(userId, id));
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    const discovered = await findLiveInstanceConnection(userId, id);
    if (!discovered) throw error;
    connection = discovered.connection;
  }

  const { client } = await awsProviderService.getEC2Client(
    userId,
    connection.encryptedCredentials,
    infrastructure?.region || connection.region
  );

  const instanceId = infrastructure?.instanceId || id;
  await client.send(new CommandClass({ InstanceIds: [instanceId] }));

  if (infrastructure) {
    infrastructure.ec2Status = nextStatus;
    if (action === "terminate") {
      infrastructure.deploymentStatus = "terminated";
      infrastructure.terminationTime = new Date();
    }
    infrastructure.auditLog.push({
      action,
      actor: userId,
      timestamp: new Date(),
      details: `${action} requested from AWS infrastructure dashboard`,
    });
    await infrastructure.save();

    const liveDetails = await fetchLiveInstanceDetails(userId, infrastructure, connection);
    return toPublicInstance(infrastructure, liveDetails, connection);
  }

  const liveDetails = await awsProviderService.getInstanceDetails(
    userId,
    connection.encryptedCredentials,
    connection.region,
    instanceId
  );
  return toPublicAWSInstance(liveDetails, connection);
}

/**
 * Get AWS connections for user
 * GET /api/aws/connections
 */
export const getAWSConnections = async (req, res) => {
  try {
    const { userId } = req.user;

    const connections = await AWSConnection.find({ userId }).select("-encryptedCredentials");

    res.json({
      success: true,
      connections,
    });
  } catch (error) {
    logger.error("Failed to get AWS connections", { error: error.message });
    res.status(500).json({
      error: "Failed to get AWS connections",
      details: error.message,
    });
  }
};

/**
 * Get AWS connection details
 * GET /api/aws/connections/:connectionId
 */
export const getAWSConnection = async (req, res) => {
  try {
    const { userId } = req.user;
    const { connectionId } = req.params;

    const connection = await AWSConnection.findOne({
      _id: connectionId,
      userId,
    }).select("-encryptedCredentials");

    if (!connection) {
      return res.status(404).json({
        error: "AWS connection not found",
      });
    }

    res.json({
      success: true,
      connection,
    });
  } catch (error) {
    logger.error("Failed to get AWS connection", { error: error.message });
    res.status(500).json({
      error: "Failed to get AWS connection",
      details: error.message,
    });
  }
};

/**
 * Disconnect AWS account
 * DELETE /api/aws/connections/:connectionId
 */
export const disconnectAWS = async (req, res) => {
  try {
    const { userId } = req.user;
    const { connectionId } = req.params;

    const connection = await AWSConnection.findOneAndUpdate(
      {
        _id: connectionId,
        userId,
      },
      {
        connected: false,
      },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({
        error: "AWS connection not found",
      });
    }

    // Clear client cache
    awsProviderService.disconnect(userId);

    logger.info("AWS connection disconnected", { userId, connectionId });

    res.json({
      success: true,
      message: "AWS connection disconnected",
    });
  } catch (error) {
    logger.error("Failed to disconnect AWS", { error: error.message });
    res.status(500).json({
      error: "Failed to disconnect AWS",
      details: error.message,
    });
  }
};

/**
 * Create infrastructure (async)
 * POST /api/aws/infrastructure/create
 * Returns immediately with jobId for polling
 */
export const createInfrastructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { connectionId, instanceType, os, storageSize, name, region } = req.body;

    // Validate required fields
    if (!connectionId || !instanceType || !os || !region) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        details: "Required fields: connectionId, instanceType, os, region",
        failureType: "INPUT_VALIDATION_ERROR",
      });
    }
    const validatedInstanceType = getConfiguredInstanceType(instanceType);

    // Get and validate connection
    const connection = await AWSConnection.findOne({
      _id: connectionId,
      userId,
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "AWS connection not found",
        failureType: "CONNECTION_NOT_FOUND",
      });
    }

    if (!connection.connected) {
      return res.status(400).json({
        success: false,
        error: "AWS connection is not active",
        failureType: "CONNECTION_INACTIVE",
      });
    }

    // Check if job queue can accept new jobs
    if (!provisioningJobQueue.canAcceptNewJob()) {
      return res.status(429).json({
        success: false,
        error: "Job queue is full",
        details: "Too many provisioning jobs are running. Please try again later.",
        failureType: "QUEUE_FULL",
      });
    }

    logger.info("Infrastructure provisioning request received", {
      userId,
      connectionId,
      instanceType: validatedInstanceType,
      os,
      region,
      name: name || "auto-generated",
    });

    // Start async provisioning
    const jobInfo = await enhancedAWSInfrastructureProvisioningService.startAsyncProvisioning(
      userId,
      connectionId,
      {
        instanceType: validatedInstanceType,
        os,
        storageSize,
        name: name || `devops-hub-${Date.now()}`,
        region,
      }
    );

    // Update connection statistics
    connection.infrastructureCount = (connection.infrastructureCount || 0) + 1;
    await connection.save();

    logger.info("Infrastructure provisioning job created", {
      jobId: jobInfo.jobId,
      userId,
      connectionId,
    });

    res.status(202).json({
      success: true,
      jobId: jobInfo.jobId,
      status: jobInfo.status,
      progress: jobInfo.progress,
      message: "Provisioning job queued. Use the jobId to poll for status.",
      statusUrl: `/api/aws/infrastructure/provisioning-status/${jobInfo.jobId}`,
    });
  } catch (error) {
    logger.error("Failed to queue infrastructure provisioning", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: "Failed to queue infrastructure provisioning",
      details: error.message,
      failureType: "UNEXPECTED_ERROR",
    });
  }
};

/**
 * Get provisioning job status
 * GET /api/aws/infrastructure/provisioning-status/:jobId
 */
export const getProvisioningStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "Job ID is required",
        failureType: "INPUT_VALIDATION_ERROR",
      });
    }

    const jobStatus = await provisioningJobQueue.getJobStatus(jobId);

    res.json({
      success: true,
      job: jobStatus,
    });
  } catch (error) {
    if (error.message === "Job not found") {
      return res.status(404).json({
        success: false,
        error: "Provisioning job not found",
        details: `Job ID: ${req.params.jobId}`,
        failureType: "JOB_NOT_FOUND",
      });
    }

    logger.error("Failed to get provisioning status", {
      error: error.message,
      jobId: req.params.jobId,
    });

    res.status(500).json({
      success: false,
      error: "Failed to get provisioning status",
      details: error.message,
      failureType: "UNEXPECTED_ERROR",
    });
  }
};

/**
 * Get provisioning job debug details
 * GET /api/aws/jobs/:jobId/debug
 */
export const getProvisioningDebug = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "Job ID is required",
        failureType: "INPUT_VALIDATION_ERROR",
      });
    }

    const debug = await provisioningJobQueue.getJobDebug(jobId);

    res.json({
      success: true,
      ...debug,
    });
  } catch (error) {
    if (error.message === "Job not found") {
      return res.status(404).json({
        success: false,
        error: "Provisioning job not found",
        details: `Job ID: ${req.params.jobId}`,
        failureType: "JOB_NOT_FOUND",
      });
    }

    logger.error("Failed to get provisioning debug details", {
      error: error.message,
      jobId: req.params.jobId,
    });

    res.status(500).json({
      success: false,
      error: "Failed to get provisioning debug details",
      details: error.message,
      failureType: "UNEXPECTED_ERROR",
    });
  }
};

/**
 * List EC2 instances from connected AWS accounts with DevOps Hub metadata merged in.
 * GET /api/aws/instances
 */
export const listAWSInstances = async (req, res) => {
  try {
    const { userId } = req.user;
    const { connectionId, region, status, search } = req.query;

    const connectionQuery = { userId, connected: true };
    if (connectionId) connectionQuery._id = connectionId;
    if (region) connectionQuery.region = region;

    const connections = await AWSConnection.find(connectionQuery);
    const connectionIds = connections.map((connection) => connection._id);

    const infrastructures = await AWSInfrastructure.find({
      userId,
      ...(connectionIds.length ? { awsConnectionId: { $in: connectionIds } } : {}),
      ...(region ? { region } : {}),
    })
      .populate("awsConnectionId", "connectionName region accountId")
      .sort({ createdAt: -1 });

    const infrastructureByInstanceId = new Map(
      infrastructures.map((infrastructure) => [infrastructure.instanceId, infrastructure])
    );
    const instancesByInstanceId = new Map();

    for (const connection of connections) {
      try {
        const liveInstances = await awsProviderService.listInstances(
          userId,
          connection.encryptedCredentials,
          connection.region
        );

        for (const liveInstance of liveInstances) {
          const infrastructure = infrastructureByInstanceId.get(liveInstance.instanceId);
          const publicInstance = infrastructure
            ? toPublicInstance(infrastructure, liveInstance, connection)
            : toPublicAWSInstance(liveInstance, connection);

          instancesByInstanceId.set(liveInstance.instanceId, publicInstance);

          if (infrastructure && liveInstance.state && liveInstance.state !== infrastructure.ec2Status) {
            infrastructure.ec2Status = liveInstance.state;
            infrastructure.publicIp = liveInstance.publicIp || infrastructure.publicIp;
            infrastructure.privateIp = liveInstance.privateIp || infrastructure.privateIp;
            await infrastructure.save();
          }
        }
      } catch (error) {
        logger.warn("Failed to list live EC2 instances for AWS connection", {
          connectionId: connection._id,
          region: connection.region,
          error: error.message,
        });
      }
    }

    for (const infrastructure of infrastructures) {
      if (instancesByInstanceId.has(infrastructure.instanceId)) continue;
      const connection = connections.find(
        (item) => String(item._id) === String(infrastructure.awsConnectionId?._id || infrastructure.awsConnectionId)
      );
      const liveDetails = connection
        ? await fetchLiveInstanceDetails(userId, infrastructure, connection)
        : null;
      instancesByInstanceId.set(
        infrastructure.instanceId,
        toPublicInstance(infrastructure, liveDetails, connection)
      );
    }

    const instances = Array.from(instancesByInstanceId.values()).sort(
      (a, b) => new Date(b.launchTime || b.createdAt || 0) - new Date(a.launchTime || a.createdAt || 0)
    );
    const normalizedSearch = String(search || "").trim().toLowerCase();
    const filteredInstances = instances.filter((instance) => {
      const matchesSearch = !normalizedSearch
        || instance.instanceName.toLowerCase().includes(normalizedSearch)
        || instance.instanceId.toLowerCase().includes(normalizedSearch);
      const matchesStatus = !status || status === "all" || instance.state === status;
      return matchesSearch && matchesStatus;
    });

    const provisioningHistory = await ProvisioningJob.find({
      userId,
      ...(connectionId ? { awsConnectionId: connectionId } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("jobId status progress currentStep lastSuccessfulStep result error config createdAt completedAt");

    const stats = {
      total: filteredInstances.length,
      running: filteredInstances.filter((instance) => instance.state === "running").length,
      stopped: filteredInstances.filter((instance) => instance.state === "stopped").length,
      pending: filteredInstances.filter((instance) => instance.state === "pending").length,
      terminated: filteredInstances.filter((instance) => instance.state === "terminated").length,
    };

    res.json({
      success: true,
      instances: filteredInstances,
      stats,
      provisioningHistory,
      regions: [...new Set(instances.map((instance) => instance.region))],
      connectedAccounts: connections.length,
      count: filteredInstances.length,
    });
  } catch (error) {
    logger.error("Failed to list AWS instances", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to list AWS instances",
      details: error.message,
    });
  }
};

/**
 * Get one EC2 instance with live AWS state.
 * GET /api/aws/instances/:id
 */
export const getAWSInstance = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    let instance;

    try {
      const { infrastructure, connection } = await getInfrastructureWithConnection(userId, id);
      const liveDetails = await fetchLiveInstanceDetails(userId, infrastructure, connection);
      instance = toPublicInstance(infrastructure, liveDetails, connection);
    } catch (error) {
      if (error.statusCode !== 404) throw error;
      const discovered = await findLiveInstanceConnection(userId, id);
      if (!discovered) throw error;
      const liveDetails = await awsProviderService.getInstanceDetails(
        userId,
        discovered.connection.encryptedCredentials,
        discovered.connection.region,
        id
      );
      instance = toPublicAWSInstance(liveDetails, discovered.connection);
    }

    res.json({
      success: true,
      instance,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error("Failed to get AWS instance", {
      id: req.params.id,
      error: error.message,
    });
    res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

export const startAWSInstance = async (req, res) => {
  try {
    const instance = await applyInstanceAction(
      req.user.userId,
      req.params.id,
      "start",
      StartInstancesCommand,
      "pending"
    );
    res.json({ success: true, message: "Instance start requested", instance });
  } catch (error) {
    logger.error("Failed to start AWS instance", { id: req.params.id, error: error.message });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

export const stopAWSInstance = async (req, res) => {
  try {
    const instance = await applyInstanceAction(
      req.user.userId,
      req.params.id,
      "stop",
      StopInstancesCommand,
      "stopping"
    );
    res.json({ success: true, message: "Instance stop requested", instance });
  } catch (error) {
    logger.error("Failed to stop AWS instance", { id: req.params.id, error: error.message });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

export const restartAWSInstance = async (req, res) => {
  try {
    const instance = await applyInstanceAction(
      req.user.userId,
      req.params.id,
      "restart",
      RebootInstancesCommand,
      "running"
    );
    res.json({ success: true, message: "Instance restart requested", instance });
  } catch (error) {
    logger.error("Failed to restart AWS instance", { id: req.params.id, error: error.message });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

export const terminateAWSInstance = async (req, res) => {
  try {
    const instance = await applyInstanceAction(
      req.user.userId,
      req.params.id,
      "terminate",
      TerminateInstancesCommand,
      "shutting-down"
    );
    res.json({ success: true, message: "Instance termination requested", instance });
  } catch (error) {
    logger.error("Failed to terminate AWS instance", { id: req.params.id, error: error.message });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

/**
 * Get user's infrastructure
 * GET /api/aws/infrastructure
 */
export const getInfrastructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { region } = req.query;

    const query = { userId };
    if (region) {
      query.region = region;
    }

    const infrastructure = await AWSInfrastructure.find(query)
      .populate("awsConnectionId", "connectionName region")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      infrastructure,
      count: infrastructure.length,
    });
  } catch (error) {
    logger.error("Failed to get infrastructure", { error: error.message });
    res.status(500).json({
      error: "Failed to get infrastructure",
      details: error.message,
    });
  }
};

/**
 * Get infrastructure details
 * GET /api/aws/infrastructure/:infrastructureId
 */
export const getInfrastructureDetails = async (req, res) => {
  try {
    const { userId } = req.user;
    const { infrastructureId } = req.params;

    const infrastructure = await AWSInfrastructure.findOne({
      _id: infrastructureId,
      userId,
    }).populate("awsConnectionId", "connectionName region accountId");

    if (!infrastructure) {
      return res.status(404).json({
        error: "Infrastructure not found",
      });
    }

    res.json({
      success: true,
      infrastructure,
    });
  } catch (error) {
    logger.error("Failed to get infrastructure details", { error: error.message });
    res.status(500).json({
      error: "Failed to get infrastructure details",
      details: error.message,
    });
  }
};

/**
 * Get infrastructure dashboard
 * GET /api/aws/infrastructure/:infrastructureId/dashboard
 */
export const getInfrastructureDashboard = async (req, res) => {
  try {
    const { userId } = req.user;
    const { infrastructureId } = req.params;

    const dashboard = await awsInfrastructureProvisioningService.getInfrastructureDashboard(
      userId,
      infrastructureId
    );

    res.json({
      success: true,
      ...dashboard,
    });
  } catch (error) {
    logger.error("Failed to get infrastructure dashboard", { error: error.message });
    res.status(500).json({
      error: "Failed to get dashboard",
      details: error.message,
    });
  }
};

/**
 * Terminate infrastructure
 * POST /api/aws/infrastructure/:infrastructureId/terminate
 */
export const terminateInfrastructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { infrastructureId } = req.params;
    const { confirmTermination } = req.body;

    if (!confirmTermination) {
      return res.status(400).json({
        error: "Please confirm termination by sending confirmTermination=true",
      });
    }

    const result = await awsInfrastructureProvisioningService.terminateInfrastructure(
      userId,
      infrastructureId
    );

    res.json(result);
  } catch (error) {
    logger.error("Failed to terminate infrastructure", { error: error.message });
    res.status(500).json({
      error: "Failed to terminate infrastructure",
      details: error.message,
    });
  }
};

/**
 * Update infrastructure status
 * PATCH /api/aws/infrastructure/:infrastructureId/status
 */
export const updateInfrastructureStatus = async (req, res) => {
  try {
    const { userId } = req.user;
    const { infrastructureId } = req.params;
    const { deploymentStatus, bootstrapStatus, ec2Status } = req.body;

    const updates = {};
    if (deploymentStatus) updates.deploymentStatus = deploymentStatus;
    if (bootstrapStatus) updates.bootstrapStatus = bootstrapStatus;
    if (ec2Status) updates.ec2Status = ec2Status;

    const infrastructure = await awsInfrastructureProvisioningService.updateInfrastructureStatus(
      userId,
      infrastructureId,
      updates
    );

    res.json({
      success: true,
      infrastructure,
    });
  } catch (error) {
    logger.error("Failed to update infrastructure status", { error: error.message });
    res.status(500).json({
      error: "Failed to update status",
      details: error.message,
    });
  }
};

/**
 * Get available instance types
 * GET /api/aws/instance-types
 */
export const getInstanceTypes = async (req, res) => {
  try {
    res.json({
      success: true,
      instanceTypes: [
        {
          name: "t3.micro",
          description: "1 GB RAM, 2 vCPU - Burst capable",
          memory: 1024,
          cpu: 2,
          costPerMonth: 7.6,
        },
        {
          name: "t3.small",
          description: "2 GB RAM, 2 vCPU - Good for small apps",
          memory: 2048,
          cpu: 2,
          costPerMonth: 15.2,
        },
      ],
      operatingSystems: [
        {
          name: "ubuntu",
          displayName: "Ubuntu 22.04 LTS",
          defaultUser: "ubuntu",
          notes: "Long-term support, widely compatible",
        },
        {
          name: "amazon-linux",
          displayName: "Amazon Linux 2023",
          defaultUser: "ec2-user",
          notes: "AWS-optimized, lightweight",
        },
      ],
      regions: [
        { name: "us-east-1", displayName: "N. Virginia" },
        { name: "us-east-2", displayName: "Ohio" },
        { name: "us-west-1", displayName: "N. California" },
        { name: "us-west-2", displayName: "Oregon" },
        { name: "eu-west-1", displayName: "Ireland" },
        { name: "eu-central-1", displayName: "Frankfurt" },
        { name: "ap-southeast-1", displayName: "Singapore" },
        { name: "ap-southeast-2", displayName: "Sydney" },
      ],
    });
  } catch (error) {
    logger.error("Failed to get instance types", { error: error.message });
    res.status(500).json({
      error: "Failed to get instance types",
      details: error.message,
    });
  }
};
