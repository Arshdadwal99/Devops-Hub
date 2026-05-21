import mongoose from "mongoose";

const webhookSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: ["push", "pull_request", "release"],
      required: true,
    },
    repository: {
      name: {
        type: String,
        required: true,
      },
      owner: String,
      url: String,
      fullName: String,
    },
    commit: {
      sha: String,
      message: String,
      author: {
        name: String,
        email: String,
        username: String,
      },
      timestamp: Date,
      url: String,
    },
    branch: String,
    pusher: {
      name: String,
      email: String,
    },
    jenkinsPipelineTriggered: {
      type: Boolean,
      default: false,
    },
    jenkinsBuildNumber: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    errorMessage: String,
    // Deployment automation tracking
    deploymentTriggered: {
      type: Boolean,
      default: false,
    },
    deploymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deployment",
    },
    deploymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: null,
    },
    deploymentError: String,
    deploymentStartTime: Date,
    deploymentEndTime: Date,
    deploymentImageTag: String,
    rawPayload: mongoose.Schema.Types.Mixed,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const Webhook = mongoose.model("Webhook", webhookSchema);
