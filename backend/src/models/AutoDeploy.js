import mongoose from "mongoose";

const autoDeployLogSchema = new mongoose.Schema(
  {
    status: String,
    message: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const autoDeploySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "QUEUED",
        "BUILDING",
        "TESTING",
        "PUSHING",
        "DEPLOYING",
        "HEALTH_CHECK",
        "SUCCESS",
        "FAILED",
        "DISABLED",
      ],
      default: "QUEUED",
      index: true,
    },
    repository: {
      owner: String,
      name: String,
      fullName: String,
      branch: String,
      url: String,
    },
    jenkinsJob: {
      jobId: String,
      jobName: String,
      jobUrl: String,
    },
    githubWebhook: {
      hookId: Number,
      webhookUrl: String,
      events: [String],
    },
    dockerHub: {
      username: String,
    },
    ec2: {
      host: String,
      username: String,
      port: Number,
    },
    workflow: {
      type: [String],
      default: [
        "GitHub Push",
        "GitHub Webhook",
        "Jenkins Job Trigger",
        "Build Docker Image",
        "Push Docker Hub",
        "Deploy EC2",
        "Health Check",
      ],
    },
    deploymentId: String,
    pipelineId: mongoose.Schema.Types.ObjectId,
    enabledAt: Date,
    disabledAt: Date,
    lastRunAt: Date,
    latestDeploymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deployment",
    },
    logs: {
      type: [autoDeployLogSchema],
      default: [],
    },
  },
  { timestamps: true }
);

autoDeploySchema.index(
  { userId: 1, "repository.fullName": 1, "repository.branch": 1 },
  { unique: true }
);

export const AutoDeploy = mongoose.model("AutoDeploy", autoDeploySchema);
