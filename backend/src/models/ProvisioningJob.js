/**
 * Provisioning Job Model
 * Tracks the status and progress of infrastructure provisioning jobs
 */

import mongoose from "mongoose";

const provisioningJobSchema = new mongoose.Schema(
  {
    // Job identifiers
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    awsConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AWSConnection",
      required: true,
    },

    // Configuration
    config: {
      instanceType: String,
      os: String,
      storageSize: Number,
      name: String,
      region: String,
    },

    // Progress tracking
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },

    currentStep: {
      type: String,
      enum: [
        "initialization",
        "creating_security_group",
        "authorizing_security_group",
        "fetching_ami",
        "creating_ec2_instance",
        "waiting_running_state",
        "allocating_public_ip",
        "completing",
      ],
      default: "initialization",
    },

    lastSuccessfulStep: String,
    awsOperation: String,
    currentOperation: String,

    debugLogs: [
      {
        level: {
          type: String,
          enum: ["info", "warn", "error"],
          default: "info",
        },
        message: String,
        awsOperation: String,
        details: mongoose.Schema.Types.Mixed,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Step-by-step logs
    steps: [
      {
        step: String,
        status: {
          type: String,
          enum: ["pending", "in_progress", "completed", "failed"],
          default: "pending",
        },
        progress: Number,
        message: String,
        error: String,
        awsRequestId: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        duration: Number, // milliseconds
      },
    ],

    // Results
    result: {
      instanceId: String,
      securityGroupId: String,
      securityGroupName: String,
      publicIp: String,
      privateIp: String,
      instanceType: String,
      operatingSystem: String,
      region: String,
      infrastructureId: mongoose.Schema.Types.ObjectId,
    },

    // Error information
    error: {
      message: String,
      type: String,
      code: String,
      failedStep: String,
      awsErrorCode: String,
      awsErrorMessage: String,
      requestId: String,
      fullError: String,
      executionStop: {
        file: String,
        method: String,
        line: Number,
        raw: String,
      },
    },

    // Timing information
    startedAt: Date,
    completedAt: Date,
    estimatedCompletionTime: Date,

    // Metadata
    retryCount: {
      type: Number,
      default: 0,
    },
    lastRetryAt: Date,
    tags: {
      type: Map,
      of: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
provisioningJobSchema.index({ userId: 1, createdAt: -1 });
provisioningJobSchema.index({ status: 1, createdAt: -1 });

// Methods
provisioningJobSchema.methods.updateStep = function (stepName, status, message, options = {}) {
  const step = {
    step: stepName,
    status,
    message,
    timestamp: new Date(),
  };

  if (options.progress !== undefined) {
    step.progress = options.progress;
    this.progress = options.progress;
  }

  if (options.awsRequestId) {
    step.awsRequestId = options.awsRequestId;
  }

  if (options.error) {
    step.error = options.error;
  }

  if (options.duration) {
    step.duration = options.duration;
  }

  this.steps.push(step);
  this.currentStep = stepName;
  if (status === "completed") {
    this.lastSuccessfulStep = stepName;
  }

  return this;
};

provisioningJobSchema.methods.markComplete = function (result) {
  this.status = "completed";
  this.progress = 100;
  this.result = result;
  this.completedAt = new Date();
  return this;
};

provisioningJobSchema.methods.markFailed = function (error, failedStep) {
  this.status = "failed";
  this.error = error;
  if (failedStep) {
    this.error.failedStep = failedStep;
  }
  this.completedAt = new Date();
  return this;
};

provisioningJobSchema.methods.toResponse = function () {
  return {
    jobId: this.jobId,
    userId: this.userId,
    status: this.status,
    progress: this.progress,
    currentStep: this.currentStep,
    stoppedAtStep: this.status === "failed" ? this.currentStep : undefined,
    lastSuccessfulStep: this.lastSuccessfulStep,
    awsOperation: this.awsOperation,
    currentOperation: this.currentOperation || this.awsOperation,
    config: this.config,
    steps: this.steps,
    debugLogs: this.debugLogs,
    result: this.result,
    error: this.error,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    estimatedCompletionTime: this.estimatedCompletionTime,
    createdAt: this.createdAt,
  };
};

export const ProvisioningJob = mongoose.model("ProvisioningJob", provisioningJobSchema);
