import mongoose from "mongoose";

const pipelineSchema = new mongoose.Schema(
  {
    buildStatus: { type: String, required: true },
    deploymentStatus: { type: String, required: true },
    environment: { type: String, required: true },
    lastCommit: {
      hash: { type: String, required: true },
      message: { type: String, required: true },
      author: { type: String, required: true },
      timestamp: { type: Date, required: true },
    },
    progress: { type: Number, required: true },
    workflow: { type: String, required: true },
  },
  { _id: false }
);

const metricPointSchema = new mongoose.Schema(
  {
    time: { type: String, required: true },
    cpu: { type: Number, required: true },
    memory: { type: Number, required: true },
    traffic: { type: Number, required: true },
  },
  { _id: false }
);

const logsSchema = new mongoose.Schema(
  {
    deployment: [{ type: String, required: true }],
    errorLogs: [{ type: String, required: true }],
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    severity: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const dashboardStateSchema = new mongoose.Schema(
  {
    pipeline: { type: pipelineSchema, required: true },
    metrics: {
      cpu: { type: Number, required: true },
      memory: { type: Number, required: true },
      activeContainers: { type: Number, required: true },
      latency: { type: Number, required: true },
      history: { type: [metricPointSchema], required: true },
    },
    logs: { type: logsSchema, required: true },
    alerts: { type: [alertSchema], required: true },
    controlPanel: {
      currentVersion: { type: String, required: true },
      previousVersion: { type: String, required: true },
      lastDeploymentAt: { type: Date, required: true },
      nextRecommendation: { type: String, required: true },
    },
  },
  { timestamps: true }
);

export const DashboardState = mongoose.model(
  "DashboardState",
  dashboardStateSchema
);
