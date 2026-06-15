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
    provider: {
      type: String,
      enum: ["jenkins", "github-actions"],
      default: "jenkins",
    },
    repository: {
      owner: String,
      name: String,
      branch: String,
      workflowPath: String,
      htmlUrl: String,
    },
    projectType: String,
    generatedWorkflow: {
      path: String,
      content: String,
      sha: String,
      commitUrl: String,
      generatedAt: Date,
    },
    runtime: {
      setupAction: String,
      version: String,
      installCommand: String,
      testCommand: String,
      buildCommand: String,
      dockerImage: String,
      appPort: Number,
    },
    deploymentConfig: {
      dockerHub: {
        username: String,
        credentialsId: String,
      },
      ec2: {
        host: String,
        username: String,
        port: Number,
        sshCredentialsId: String,
      },
      jenkins: {
        url: String,
        username: String,
      },
    },
    jenkinsJob: {
      jobId: String,
      jobName: String,
      jobUrl: String,
      createdAt: Date,
    },
    githubWebhook: {
      hookId: Number,
      webhookUrl: String,
      events: [String],
      connectedAt: Date,
      deliveryValidationStatus: String,
    },
    autoDeploy: {
      enabled: {
        type: Boolean,
        default: false,
      },
      enabledAt: Date,
      disabledAt: Date,
      status: String,
      workflow: [String],
    },
    statusTracking: {
      workflowStatus: {
        type: String,
        enum: ["not_generated", "generated", "committed", "pending", "running", "success", "failed"],
        default: "not_generated",
      },
      lastRunId: String,
      lastRunUrl: String,
      lastRunConclusion: String,
      lastRunAt: Date,
      healthCheckStatus: {
        type: String,
        enum: ["unknown", "pending", "healthy", "unhealthy"],
        default: "unknown",
      },
    },
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
