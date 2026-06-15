/**
 * EC2 Auto Key Generation Service
 * 
 * Automatically generates unique AWS EC2 key pairs for each deployment.
 * Stores the private key material in the database for future SSH operations.
 * 
 * Flow:
 * 1. Generate unique key pair name: DevOpsHub-{deploymentId}-{timestamp}
 * 2. Call AWS CreateKeyPairCommand
 * 3. Store KeyMaterial in AWSInfrastructure document
 * 4. Return key pair name for instance creation
 * 5. SSH operations load the stored key from database
 */

import { CreateKeyPairCommand, DeleteKeyPairCommand, DescribeKeyPairsCommand } from "@aws-sdk/client-ec2";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { logger } from "../utils/logger.js";
import { awsProviderService } from "./awsProviderService.js";

async function getEc2ClientForConnection(userId, awsConnection, region) {
  const ec2ClientResult = awsConnection?.encryptedCredentials
    ? await awsProviderService.getEC2Client(
        userId || awsConnection.userId || "system",
        awsConnection.encryptedCredentials,
        region || awsConnection.region || "us-east-1"
      )
    : await awsProviderService.getEC2Client(awsConnection);
  return ec2ClientResult.client || ec2ClientResult;
}

class EC2AutoKeyGenerationService {
  /**
   * Generate and store a new EC2 key pair for a deployment
   * @param {string} deploymentId - Unique deployment ID
   * @param {string} userId - User ID
   * @param {object} awsConnection - AWS connection details with credentials
   * @param {string} region - AWS region
   * @returns {Promise<{keyName: string, keyMaterial: string}>}
   */
  async generateDeploymentKeyPair(deploymentId, userId, awsConnection, region = "us-east-1") {
    try {
      // Step 1: Generate unique key pair name
      const keyName = `DevOpsHub-${deploymentId}`;
      logger.info("EC2 Key Generation: Creating key pair", {
        deploymentId,
        userId,
        keyName,
        region,
      });

      // Step 2: Get EC2 client from AWS provider service
      const ec2Client = await getEc2ClientForConnection(userId, awsConnection, region);

      // Step 3: Create key pair in AWS
      let keyMaterial;
      try {
        const createKeyCommand = new CreateKeyPairCommand({
          KeyName: keyName,
          KeyType: "rsa",
          KeyFormat: "pem",
        });
        const response = await ec2Client.send(createKeyCommand);
        keyMaterial = response.KeyMaterial;
        console.log("KEY GENERATED", {
          keyName: response.KeyName,
          hasKeyMaterial: !!response.KeyMaterial,
          keyLength: response.KeyMaterial?.length,
        });

        logger.info("EC2 Key Generation: Key pair created in AWS", {
          deploymentId,
          keyName,
          keyLength: keyMaterial?.length || 0,
        });
      } catch (error) {
        logger.error("EC2 Key Generation: AWS CreateKeyPairCommand failed", {
          deploymentId,
          keyName,
          error: error.message,
          awsCode: error.__type,
        });
        throw new Error(`Failed to create AWS key pair: ${error.message}`);
      }

      // Step 4: Validate key material
      if (!keyMaterial || !keyMaterial.includes("BEGIN") || !keyMaterial.includes("END")) {
        throw new Error("AWS returned invalid key material - missing PEM markers");
      }

      logger.info("EC2 Key Generation: Key pair generated successfully", {
        deploymentId,
        keyName,
        keyLength: keyMaterial.length,
      });

      // Log key creation event
      logger.info("🔐 [KEY PAIR CREATED]", {
        event: "KeyPairCreated",
        keyName,
        deploymentId,
        timestamp: new Date().toISOString(),
        region,
        keyFormat: "pem",
      });

      const createdAt = new Date();
      return {
        keyName,
        keyMaterial,
        createdAt,
        generatedAt: createdAt,
      };
    } catch (error) {
      logger.error("EC2 Key Generation failed", {
        deploymentId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store generated key pair in infrastructure document
   * @param {string} instanceId - EC2 instance ID
   * @param {string} keyName - Key pair name
   * @param {string} keyMaterial - Private key content
   * @returns {Promise<object>}
   */
  async storeKeyInInfrastructure(instanceId, keyName, keyMaterial) {
    try {
      const infrastructure = await AWSInfrastructure.findOne({ instanceId });
      if (!infrastructure) {
        throw new Error(`Infrastructure document not found for instanceId: ${instanceId}`);
      }

      infrastructure.keyPairName = keyName;
      // Store the private key securely - in production, consider encryption
      infrastructure.privateKey = keyMaterial;
      infrastructure.keyGeneratedAt = new Date();

      await infrastructure.save();

      logger.info("EC2 Key Generation: Key stored in infrastructure", {
        instanceId,
        keyName,
      });

      return infrastructure;
    } catch (error) {
      logger.error("EC2 Key Generation: Failed to store key in infrastructure", {
        instanceId,
        keyName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Load stored private key from infrastructure document
   * @param {string} instanceId - EC2 instance ID
   * @returns {Promise<string>} - Private key material
   */
  async loadKeyFromInfrastructure(instanceId) {
    try {
      const infrastructure = await AWSInfrastructure.findOne({ instanceId });
      if (!infrastructure) {
        throw new Error(`Infrastructure document not found for instanceId: ${instanceId}`);
      }

      if (!infrastructure.privateKey) {
        throw new Error(
          `No private key stored for instanceId: ${instanceId}. Key pair may not have been generated.`
        );
      }

      logger.info("EC2 Key Generation: Key loaded from infrastructure", {
        instanceId,
        keyName: infrastructure.keyPairName,
      });

      return infrastructure.privateKey;
    } catch (error) {
      logger.error("EC2 Key Generation: Failed to load key from infrastructure", {
        instanceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get key pair name from infrastructure
   * @param {string} instanceId - EC2 instance ID
   * @returns {Promise<string>} - Key pair name
   */
  async getKeyPairName(instanceId) {
    try {
      const infrastructure = await AWSInfrastructure.findOne({ instanceId });
      if (!infrastructure || !infrastructure.keyPairName) {
        throw new Error(`No key pair found for instanceId: ${instanceId}`);
      }
      return infrastructure.keyPairName;
    } catch (error) {
      logger.error("EC2 Key Generation: Failed to get key pair name", {
        instanceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a key pair from AWS
   * @param {string} keyName - Key pair name
   * @param {object} awsConnection - AWS connection details
   * @returns {Promise<void>}
   */
  async deleteKeyPair(keyName, awsConnection) {
    try {
      const ec2Client = await getEc2ClientForConnection(awsConnection?.userId, awsConnection);
      const deleteKeyCommand = new DeleteKeyPairCommand({
        KeyName: keyName,
      });
      await ec2Client.send(deleteKeyCommand);

      logger.info("EC2 Key Generation: Key pair deleted from AWS", {
        keyName,
      });
    } catch (error) {
      logger.warn("EC2 Key Generation: Failed to delete key pair from AWS", {
        keyName,
        error: error.message,
      });
      // Don't throw - cleanup is not critical
    }
  }

  /**
   * Verify key pair exists in AWS
   * @param {string} keyName - Key pair name
   * @param {object} awsConnection - AWS connection details
   * @returns {Promise<boolean>}
   */
  async keyPairExistsInAws(keyName, awsConnection) {
    try {
      const ec2Client = await getEc2ClientForConnection(awsConnection?.userId, awsConnection);
      const describeCommand = new DescribeKeyPairsCommand({
        KeyNames: [keyName],
      });
      const response = await ec2Client.send(describeCommand);
      return response.KeyPairs?.length > 0;
    } catch (error) {
      logger.warn("EC2 Key Generation: Failed to verify key pair in AWS", {
        keyName,
        error: error.message,
      });
      return false;
    }
  }
}

// Export singleton instance
export const ec2AutoKeyGenerationService = new EC2AutoKeyGenerationService();
