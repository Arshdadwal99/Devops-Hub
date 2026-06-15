/**
 * EC2 Auto-Provisioning Service
 * 
 * Automatically provisions EC2 instances when AWS Account is connected.
 * 
 * Priority order:
 * 1. Reuse existing DevOpsHub-managed EC2 instance
 * 2. Create configured free-tier EC2 instance
 * 3. Retry once with t3.micro if provisioning fails
 * 
 * Automatically:
 * - Creates security group with ports 22, 80, 443 open
 * - Installs Docker on the instance
 * - Manages instance lifecycle
 */

import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { logger } from "../utils/logger.js";
import { ec2IntelligentProvisioningService } from "./ec2IntelligentProvisioningService.js";
import {
  INSTANCE_TYPE,
  getAwsErrorResponse,
  getConfiguredInstanceType,
  logEC2Launch,
} from "./freeTierInstanceTypes.js";

/**
 * Find or provision EC2 instance for deployment
 */
export async function findOrProvisionEC2(userId, options = {}) {
  try {
    logger.info("EC2 Auto-Provisioning: Starting", { userId, options });

    // Step 1: Check for existing DevOpsHub-managed instances
    const existingInstance = await findExistingDevOpsHubInstance(userId);
    if (existingInstance) {
      logger.info("EC2 Auto-Provisioning: Using existing instance", {
        userId,
        instanceId: existingInstance.instanceId,
      });
      return {
        success: true,
        instanceId: existingInstance.instanceId,
        publicIp: existingInstance.publicIp,
        state: existingInstance.ec2Status,
        source: "existing",
        instance: existingInstance,
      };
    }

    // Step 2: Get AWS connection
    const awsConnection = await AWSConnection.findOne({ userId, connected: true }).lean();
    if (!awsConnection) {
      throw new Error("AWS Account not connected. Cannot auto-provision EC2.");
    }

    // Step 3: Provision new free-tier instance
    const provisionResult = await provisionFreeTierInstance(userId, awsConnection, options);
    logger.info("EC2 Auto-Provisioning: New instance created", {
      userId,
      instanceId: provisionResult.instanceId,
    });

    return {
      success: true,
      instanceId: provisionResult.instanceId,
      publicIp: provisionResult.publicIp,
      state: "running",
      source: "auto-provisioned",
      instance: provisionResult,
    };
  } catch (error) {
    logger.error("EC2 Auto-Provisioning failed", { userId, error: error.message });
    throw error;
  }
}

/**
 * Find existing DevOpsHub-managed EC2 instance
 */
async function findExistingDevOpsHubInstance(userId) {
  try {
    const instance = await AWSInfrastructure.findOne(
      {
        userId,
        managedBy: "devops-hub",
        ec2Status: "running",
        deploymentStatus: { $ne: "terminated" },
      },
      null,
      { sort: { updatedAt: -1 } }
    ).lean();

    return instance;
  } catch (error) {
    logger.warn("Failed to search for existing instances", { userId, error: error.message });
    return null;
  }
}

/**
 * Provision free-tier EC2 instance
 */
async function provisionFreeTierInstance(userId, awsConnection, options = {}) {
  try {
    const instanceType = getConfiguredInstanceType(options.instanceType || INSTANCE_TYPE);
    let result = await createFreeTierInstance(userId, awsConnection, instanceType, options);
    
    if (result.success) {
      return result.instance;
    }

    logger.error("EC2 Auto-Provisioning: provisioning failed, retrying with t3.micro", {
      userId,
      attemptedInstanceType: instanceType,
      awsError: getAwsErrorResponse(result.rawError),
      error: result.error,
    });
    result = await createFreeTierInstance(userId, awsConnection, "t3.micro", options);
    
    if (result.success) {
      return result.instance;
    }

    throw new Error("Could not provision free-tier EC2 instance (t3.micro retry failed)");
  } catch (error) {
    throw new Error(`Free-tier provisioning failed: ${error.message}`);
  }
}

/**
 * Create free-tier EC2 instance
 */
async function createFreeTierInstance(userId, awsConnection, instanceType, options = {}) {
  try {
    const validatedInstanceType = getConfiguredInstanceType(instanceType);
    logEC2Launch(validatedInstanceType, awsConnection.region || process.env.AWS_DEFAULT_REGION);

    logger.info("EC2 Auto-Provisioning: Creating instance", {
      userId,
      instanceType: validatedInstanceType,
      region: awsConnection.region || "us-east-1",
    });

    const provisioned = await ec2IntelligentProvisioningService.provisionOrReuse(
      userId,
      {
        owner: options.owner || "devops-hub",
        repo: options.repo || "one-click-deployment",
        branch: options.branch || "main",
        region: awsConnection.region || "us-east-1",
        preferredInstanceType: validatedInstanceType,
      },
      options.repositoryAnalysis || { size: options.size || 0 }
    );

    logger.info("EC2 Auto-Provisioning: Instance created in database", {
      userId,
      instanceId: provisioned.instanceId,
    });

    return {
      success: true,
      instance: provisioned,
    };
  } catch (error) {
    logger.error(`Failed to create ${instanceType} instance`, {
      userId,
      error: error.message,
      awsError: getAwsErrorResponse(error),
    });
    return { success: false, error: error.message, rawError: error };
  }
}

/**
 * Setup security group for EC2 instance
 * Opens ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
 */
export async function setupSecurityGroup(userId, instanceId, awsConnection) {
  throw new Error(
    `setupSecurityGroup cannot create synthetic security groups for ${instanceId}. Use ec2IntelligentProvisioningService so AWS confirms the security group.`
  );
}

/**
 * Install Docker on EC2 instance
 */
export async function installDocker(userId, instanceId, awsConnection) {
  throw new Error(
    `installDocker cannot mark Docker installed without SSH verification for ${instanceId}. Use the one-click workflow bootstrap verification.`
  );
}

/**
 * Get or create EC2 for deployment
 * Called during deployment flow when AWS is connected
 */
export async function getOrCreateDeploymentEC2(userId, deploymentConfig = {}) {
  try {
    const provisioning = await findOrProvisionEC2(userId, deploymentConfig);

    if (provisioning.success) {
      logger.info("EC2 ready for deployment", {
        userId,
        instanceId: provisioning.instanceId,
        source: provisioning.source,
      });

      return {
        success: true,
        instanceId: provisioning.instanceId,
        publicIp: provisioning.publicIp,
        privateIp: provisioning.instance?.privateIp,
        username: provisioning.instance?.operatingSystem === "amazon-linux" ? "ec2-user" : "ubuntu",
        generatedKeyName: provisioning.instance?.generatedKeyName || provisioning.instance?.keyPairName,
        generatedPrivateKey:
          provisioning.instance?.generatedKeyMaterial ||
          provisioning.instance?.generatedPrivateKey ||
          provisioning.instance?.privateKey,
        keyPairName: provisioning.instance?.keyPairName,
        autoProvisioned: provisioning.source === "auto-provisioned",
        instance: provisioning.instance,
      };
    }

    throw new Error(provisioning.error || "Failed to provision EC2");
  } catch (error) {
    logger.error("getOrCreateDeploymentEC2 failed", { userId, error: error.message });
    throw error;
  }
}

/**
 * Check if EC2 auto-provisioning is needed
 */
export function isAutoProvisioningNeeded(setup = {}) {
  return !setup.ec2AutoProvisioned && !setup.ec2Connected;
}

/**
 * Mark EC2 as automatically provisioned
 */
export async function markEC2AsAutoProvisioned(deploymentId, instanceId) {
  try {
    const { Deployment } = await import("../models/Deployment.js");
    
    await Deployment.findOneAndUpdate(
      { deploymentId },
      {
        "setup.ec2AutoProvisioned": true,
        "setup.ec2InstanceId": instanceId,
      }
    );

    logger.info("EC2 marked as auto-provisioned", { deploymentId, instanceId });
  } catch (error) {
    logger.error("Failed to mark EC2 as auto-provisioned", {
      deploymentId,
      error: error.message,
    });
  }
}
