import mongoose from "mongoose";

const githubWebhookConfigSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    hookId: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "deleted", "failed"],
      default: "active",
    },
    repository: {
      owner: String,
      name: String,
      fullName: String,
      url: String,
      branch: String,
    },
    webhookUrl: {
      type: String,
      required: true,
    },
    events: {
      type: [String],
      default: ["push", "pull_request"],
    },
    active: {
      type: Boolean,
      default: true,
    },
    githubHookUrl: String,
    testUrl: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastDelivery: {
      id: String,
      event: String,
      status: String,
      statusCode: Number,
      deliveredAt: Date,
      duration: Number,
      redelivery: Boolean,
      action: String,
      request: mongoose.Schema.Types.Mixed,
      response: mongoose.Schema.Types.Mixed,
    },
    recentDeliveries: {
      type: [
        {
          id: String,
          event: String,
          status: String,
          statusCode: Number,
          deliveredAt: Date,
          duration: Number,
          redelivery: Boolean,
          action: String,
          request: mongoose.Schema.Types.Mixed,
          response: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    deliveryValidatedAt: Date,
    deliveryValidationStatus: {
      type: String,
      enum: ["pending", "success", "failed", "unknown"],
      default: "pending",
    },
    createdInGitHubAt: Date,
    deletedFromGitHubAt: Date,
  },
  { timestamps: true }
);

githubWebhookConfigSchema.index(
  { userId: 1, "repository.fullName": 1, webhookUrl: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

export const GitHubWebhookConfig = mongoose.model("GitHubWebhookConfig", githubWebhookConfigSchema);
