import mongoose from "mongoose";

const pipelineSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "Main Pipeline",
    },
    status: {
      type: String,
      enum: ["running", "success", "failed", "pending"],
      default: "pending",
    },
    deploymentStatus: {
      type: String,
      enum: ["deploying", "healthy", "unhealthy", "rollback", "restarting"],
      default: "healthy",
    },
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
      default: "production",
    },
    lastCommit: {
      hash: String,
      message: String,
      author: String,
      timestamp: Date,
      repository: String,
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    stages: [
      {
        name: String,
        status: {
          type: String,
          enum: ["pending", "running", "success", "failed"],
          default: "pending",
        },
        duration: Number,
        logs: [String],
      },
    ],
    buildNumber: Number,
    buildUrl: String,
    startTime: Date,
    endTime: Date,
    duration: Number,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for fast queries
pipelineSchema.index({ userId: 1, createdAt: -1 });
pipelineSchema.index({ status: 1 });

export const Pipeline = mongoose.model("Pipeline", pipelineSchema);
