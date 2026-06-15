import mongoose from "mongoose";

const buildSchema = new mongoose.Schema(
  {
    buildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deploymentId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      index: true,
    },
    repository: String,
    owner: String,
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
    imageTag: {
      type: String,
      required: true,
      index: true,
    },
    imageId: {
      type: String,
      index: true,
    },
    buildStatus: {
      type: String,
      enum: ["QUEUED", "BUILDING", "SUCCESS", "FAILED"],
      default: "QUEUED",
      index: true,
    },
    status: {
      type: String,
      enum: ["QUEUED", "BUILDING", "SUCCESS", "FAILED"],
      default: "QUEUED",
      index: true,
    },
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    logs: [String],
  },
  { timestamps: true }
);

buildSchema.index({ userId: 1, createdAt: -1 });
buildSchema.index({ deploymentId: 1, createdAt: -1 });
buildSchema.index({ userId: 1, projectId: 1, commitSha: 1, status: 1, createdAt: -1 });
buildSchema.index({ userId: 1, imageTag: 1, status: 1, createdAt: -1 });

export const Build = mongoose.model("Build", buildSchema);
