import mongoose from "mongoose";

const logSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: [
        "jenkins",
        "docker",
        "deployment",
        "deployment-automation",
        "webhook",
        "dashboard",
        "rollback",
        "application",
        "system",
      ],
      required: true,
    },
    logType: {
      type: String,
      enum: ["info", "warning", "error", "debug"],
      default: "info",
    },
    pipelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pipeline",
    },
    deploymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deployment",
    },
    buildNumber: Number,
    containerName: String,
    message: {
      type: String,
      required: true,
    },
    rawLog: String,
    metadata: {
      stage: String,
      duration: Number,
      status: String,
      exitCode: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    analyzed: {
      type: Boolean,
      default: false,
    },
    aiAnalysis: {
      errors: [String],
      warnings: [String],
      possibleCauses: [String],
      suggestedFixes: [String],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// TTL index - keep logs for 90 days
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
logSchema.index({ userId: 1, timestamp: -1 });
logSchema.index({ source: 1, logType: 1 });
logSchema.index({ pipelineId: 1 });
logSchema.index({ deploymentId: 1 });

export const Log = mongoose.model("Log", logSchema);
