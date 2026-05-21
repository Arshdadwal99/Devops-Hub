import mongoose from "mongoose";

const buildHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    buildNumber: {
      type: Number,
      required: true,
    },
    jobName: {
      type: String,
      default: "devops-hub-deploy",
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "UNSTABLE", "ABORTED", "RUNNING", "PENDING"],
      required: true,
    },
    displayName: String,
    description: String,
    buildUrl: String,
    
    // Timing
    timestamp: {
      type: Date,
      required: true,
    },
    startTime: Date,
    endTime: Date,
    duration: {
      type: Number, // milliseconds
      default: 0,
    },
    estimatedDuration: Number,
    
    // Source code info
    sourceCode: {
      repository: String,
      branch: String,
      commit: String,
      commitMessage: String,
      author: String,
      authorEmail: String,
      authorUrl: String,
    },
    
    // Build parameters
    parameters: {
      REPO_NAME: String,
      COMMIT_SHA: String,
      COMMIT_MESSAGE: String,
      AUTHOR: String,
      BRANCH: String,
      ENVIRONMENT: String,
    },
    
    // Build details
    result: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "UNSTABLE", "NOT_BUILT", "ABORTED"],
    },
    
    // Pipeline stages
    stages: [
      {
        name: String,
        status: {
          type: String,
          enum: ["SUCCESS", "FAILURE", "SKIPPED", "PAUSED_PENDING_INPUT", "NOT_EXECUTED"],
        },
        startTime: Date,
        endTime: Date,
        duration: Number,
        logs: [String],
      },
    ],
    
    // Logs
    logs: {
      full: String, // Complete build log
      tail: String, // Last N lines
      html: String, // HTML formatted logs
    },
    
    // Build progress
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    
    // Artifacts
    artifacts: [
      {
        name: String,
        size: Number,
        relativePath: String,
        downloadUrl: String,
      },
    ],
    
    // Test results
    testResults: {
      totalTests: Number,
      passed: Number,
      failed: Number,
      skipped: Number,
      duration: Number,
    },
    
    // Cause (what triggered the build)
    cause: {
      type: String,
      enum: ["MANUAL", "WEBHOOK", "TIMER", "UPSTREAM", "API", "SCM"],
      default: "MANUAL",
    },
    
    // Metadata
    tags: [String],
    version: String,
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
    },
    
    // Failure info
    failureReason: String,
    failureDetails: String,
    
    // Webhook info
    webhookId: mongoose.Schema.Types.ObjectId,
    
    // Sync with MongoDB
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast queries
buildHistorySchema.index({ userId: 1, buildNumber: -1 });
buildHistorySchema.index({ userId: 1, status: 1, createdAt: -1 });
buildHistorySchema.index({ userId: 1, "sourceCode.branch": 1, createdAt: -1 });
buildHistorySchema.index({ buildNumber: 1 });
buildHistorySchema.index({ jobName: 1, buildNumber: -1 });
buildHistorySchema.index({ createdAt: -1 });
buildHistorySchema.index({ "sourceCode.commit": 1 });

// TTL index to auto-delete old builds after 90 days
buildHistorySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

export const BuildHistory = mongoose.model("BuildHistory", buildHistorySchema);
