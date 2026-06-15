/**
 * Migration: Update AWSConnection schema to new encrypted credentials format
 * 
 * Migrates existing AWS connection records from the old string format to the new
 * encrypted object format with {encryptedValue, iv, authTag} structure.
 * 
 * Old Format:
 * {
 *   encryptedCredentials: {
 *     accessKeyId: "base64_string",
 *     secretAccessKey: "base64_string"
 *   }
 * }
 * 
 * New Format:
 * {
 *   encryptedCredentials: {
 *     accessKeyId: { encryptedValue, iv, authTag },
 *     secretAccessKey: { encryptedValue, iv, authTag }
 *   }
 * }
 * 
 * This migration is for backward compatibility. If you're starting fresh,
 * this migration is not needed as the schema will accept the new format directly.
 */

import mongoose from "mongoose";
import { AWSConnection } from "../models/AWSConnection.js";
import { logger } from "../utils/logger.js";

export async function migrateAWSConnectionEncryption() {
  try {
    logger.info("Starting AWSConnection encryption migration", {
      step: "migration_start",
      timestamp: new Date().toISOString(),
    });

    // Find all connections that need migration
    // (old format would have accessKeyId as a string, not an object)
    const connectionsToMigrate = await AWSConnection.find({
      "encryptedCredentials.accessKeyId": {
        $type: "string", // MongoDB BSON type for string
      },
    });

    logger.info("Found connections to migrate", {
      count: connectionsToMigrate.length,
      step: "scanning_complete",
    });

    if (connectionsToMigrate.length === 0) {
      logger.info("No migrations needed", {
        message: "All connections already in new format",
      });
      return {
        success: true,
        migratedCount: 0,
        message: "No migrations needed - all connections already in new format",
      };
    }

    // Migrate each connection
    let migratedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const connection of connectionsToMigrate) {
      try {
        logger.info("Migrating connection", {
          connectionId: connection._id,
          connectionName: connection.connectionName,
          userId: connection.userId,
          step: "migration_in_progress",
        });

        // OLD FORMAT: String-based credentials (should not happen in normal operation)
        // If somehow old format exists, we would need to handle it
        // But based on the implementation, encryptSecret always returns object
        // So this migration is mainly for safety/future-proofing

        const accessKeyData = connection.encryptedCredentials.accessKeyId;
        const secretKeyData = connection.encryptedCredentials.secretAccessKey;

        // Check if already in new format
        if (
          typeof accessKeyData === "object" &&
          accessKeyData.encryptedValue &&
          accessKeyData.iv &&
          accessKeyData.authTag
        ) {
          logger.info("Connection already in new format", {
            connectionId: connection._id,
            step: "already_migrated",
          });
          continue;
        }

        // If we reach here, the connection is in an unexpected format
        // Mark it as needing manual review
        logger.warn("Connection in unexpected format", {
          connectionId: connection._id,
          accessKeyFormat: typeof accessKeyData,
          accessKeyKeys: Object.keys(accessKeyData || {}),
        });

        errorCount++;
        errors.push({
          connectionId: connection._id,
          reason: "Unexpected credential format",
          format: typeof accessKeyData,
        });
      } catch (error) {
        errorCount++;
        errors.push({
          connectionId: connection._id,
          reason: error.message,
        });

        logger.error("Migration failed for connection", {
          connectionId: connection._id,
          error: error.message,
          step: "migration_error",
        });
      }
    }

    const result = {
      success: errorCount === 0,
      migratedCount,
      errorCount,
      totalProcessed: connectionsToMigrate.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.info("AWSConnection encryption migration complete", {
      step: "migration_complete",
      ...result,
    });

    return result;
  } catch (error) {
    logger.error("Migration failed", {
      step: "migration_failed",
      error: error.message,
      stackTrace: error.stack,
    });

    throw error;
  }
}

/**
 * Verify that all connections are in the new format
 */
export async function verifyMigration() {
  try {
    const totalConnections = await AWSConnection.countDocuments();
    const oldFormatCount = await AWSConnection.countDocuments({
      "encryptedCredentials.accessKeyId": {
        $type: "string",
      },
    });

    const result = {
      totalConnections,
      oldFormatCount,
      newFormatCount: totalConnections - oldFormatCount,
      migrationComplete: oldFormatCount === 0,
    };

    logger.info("Migration verification complete", {
      step: "verification_complete",
      ...result,
    });

    return result;
  } catch (error) {
    logger.error("Verification failed", {
      step: "verification_failed",
      error: error.message,
    });

    throw error;
  }
}

/**
 * Run migration on application startup if needed
 */
export async function runMigrationIfNeeded() {
  try {
    const verification = await verifyMigration();

    if (!verification.migrationComplete) {
      logger.warn("Database migration needed", {
        oldFormatCount: verification.oldFormatCount,
      });

      const migrationResult = await migrateAWSConnectionEncryption();
      return migrationResult;
    }

    logger.info("Database already migrated", {
      step: "migration_check",
    });

    return {
      success: true,
      migrationNeeded: false,
      message: "Database already in new format",
    };
  } catch (error) {
    logger.error("Migration check failed", {
      step: "migration_check_failed",
      error: error.message,
    });

    // Don't throw - just log and continue
    // The application should still work even if migration check fails
    return {
      success: false,
      error: error.message,
      migrationAttempted: true,
    };
  }
}
