import mongoose from "mongoose";

/**
 * Encrypted credential schema structure
 * Stores encrypted data with IV and authentication tag for AES-256-GCM encryption
 */
const encryptedFieldSchema = {
  encryptedValue: {
    type: String,
    required: true,
    description: "Base64 encoded encrypted data",
  },
  iv: {
    type: String,
    required: true,
    description: "Base64 encoded initialization vector",
  },
  authTag: {
    type: String,
    required: true,
    description: "Base64 encoded authentication tag for GCM mode",
  },
};

const awsConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Encrypted credentials with AES-256-GCM encryption
    encryptedCredentials: {
      accessKeyId: {
        type: encryptedFieldSchema,
        required: true,
        validate: {
          validator: function (v) {
            return v && v.encryptedValue && v.iv && v.authTag;
          },
          message: "accessKeyId must have encryptedValue, iv, and authTag",
        },
      },
      secretAccessKey: {
        type: encryptedFieldSchema,
        required: true,
        validate: {
          validator: function (v) {
            return v && v.encryptedValue && v.iv && v.authTag;
          },
          message: "secretAccessKey must have encryptedValue, iv, and authTag",
        },
      },
    },
    region: {
      type: String,
      default: "us-east-1",
      enum: [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "eu-west-1",
        "eu-west-2",
        "eu-central-1",
        "ap-northeast-1",
        "ap-southeast-1",
        "ap-southeast-2",
        "ca-central-1",
      ],
    },
    // Account information
    accountId: String,
    accountArn: String,
    accountName: {
      type: String,
      default: "AWS Account",
    },

    // Connection status
    connected: {
      type: Boolean,
      default: true,
    },
    validatedAt: Date,
    lastTestedAt: Date,

    // Connection metadata
    connectionName: {
      type: String,
      required: true,
    },
    connectionType: {
      type: String,
      default: "iam-user",
    },

    // Terraform state (optional)
    terraformStateKey: String,
    terraformWorkspaceId: String,

    // Infrastructure quota limits
    quotaLimits: {
      maxInstances: { type: Number, default: 10 },
      maxSecurityGroups: { type: Number, default: 10 },
      maxElasticIPs: { type: Number, default: 5 },
    },

    // Error tracking
    lastError: String,
    lastErrorAt: Date,
    errorCount: { type: Number, default: 0 },

    // Statistics
    infrastructureCount: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    costCurrency: { type: String, default: "USD" },
  },
  {
    timestamps: true,
  }
);

// Indexes
awsConnectionSchema.index({ userId: 1, connectionName: 1 });
awsConnectionSchema.index({ connected: 1 });
awsConnectionSchema.index({ createdAt: -1 });

// Methods
awsConnectionSchema.methods.isValid = function () {
  return this.connected && (!this.lastErrorAt || Date.now() - this.lastErrorAt > 3600000); // 1 hour
};

awsConnectionSchema.methods.logError = function (error) {
  this.lastError = error;
  this.lastErrorAt = new Date();
  this.errorCount = (this.errorCount || 0) + 1;
};

awsConnectionSchema.methods.clearError = function () {
  this.lastError = null;
  this.lastErrorAt = null;
  this.errorCount = 0;
};

export const AWSConnection = mongoose.model("AWSConnection", awsConnectionSchema);
