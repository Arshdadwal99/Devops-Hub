import mongoose from "mongoose";

const deploymentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    pipelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pipeline",
    },
    buildNumber: Number,
    commitSha: String,
    repository: String,
    version: {
      type: String,
      required: true,
    },
    previousVersion: String,
    status: {
      type: String,
      enum: ["in-progress", "success", "failed", "rolled-back"],
      default: "in-progress",
    },
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
      default: "production",
    },
    containers: [
      {
        name: String,
        image: String,
        status: String,
        ports: [String],
      },
    ],
    deploymentType: {
      type: String,
      enum: ["manual", "auto", "rollback"],
      default: "auto",
    },
    deployedBy: String,
    deploymentScript: String,
    startTime: Date,
    endTime: Date,
    duration: Number,
    rollbackReason: String,
    logs: [String],
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

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ status: 1 });
deploymentSchema.index({ version: 1 });
deploymentSchema.index({ buildNumber: -1 });

export const Deployment = mongoose.model("Deployment", deploymentSchema);
