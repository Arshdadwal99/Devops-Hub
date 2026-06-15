import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    imageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    buildId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      index: true,
    },
    commitSha: {
      type: String,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    imageName: {
      type: String,
      required: true,
    },
    tag: {
      type: String,
      required: true,
    },
    imageTag: {
      type: String,
      index: true,
    },
    buildStatus: {
      type: String,
      enum: ["QUEUED", "BUILDING", "SUCCESS", "FAILED"],
      default: "SUCCESS",
      index: true,
    },
    repository: {
      type: String,
      required: true,
    },
    dockerHubUrl: {
      type: String,
      sparse: true,
    },
    size: {
      type: Number, // in bytes
      sparse: true,
    },
    digest: {
      type: String,
      sparse: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PUSHING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true,
    },
    pushedAt: {
      type: Date,
      sparse: true,
    },
    pushStartedAt: {
      type: Date,
      sparse: true,
    },
    pushDuration: {
      type: Number,
      sparse: true,
    },
    pushLogs: [
      {
        timestamp: Date,
        message: String,
        level: {
          type: String,
          enum: ["info", "warning", "error"],
          default: "info",
        },
      },
    ],
    pushError: {
      type: String,
      sparse: true,
    },
    deploymentId: {
      type: String,
      index: true,
    },
    dockerConfig: {
      username: String,
      registry: {
        type: String,
        default: "docker.io",
      },
    },
  },
  { timestamps: true }
);

imageSchema.index({ userId: 1, createdAt: -1 });
imageSchema.index({ buildId: 1, createdAt: -1 });
imageSchema.index({ status: 1, createdAt: -1 });
imageSchema.index({ userId: 1, projectId: 1, commitSha: 1, status: 1, createdAt: -1 });

export const Image = mongoose.model("Image", imageSchema);
