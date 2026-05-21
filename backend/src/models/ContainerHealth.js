import mongoose from "mongoose";

const containerHealthSchema = new mongoose.Schema(
  {
    containerId: {
      type: String,
      required: true,
      index: true,
    },
    containerName: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "paused", "stopped", "exited", "created", "restarting"],
      default: "running",
    },
    health: {
      type: String,
      enum: ["healthy", "unhealthy", "starting", "none"],
      default: "none",
    },
    cpuPercent: {
      type: Number,
      default: 0,
    },
    memoryPercent: {
      type: Number,
      default: 0,
    },
    memoryUsage: {
      type: String,
      default: "0B",
    },
    memoryLimit: {
      type: String,
      default: "0B",
    },
    networkIn: {
      type: String,
      default: "0B",
    },
    networkOut: {
      type: String,
      default: "0B",
    },
    blockIn: {
      type: String,
      default: "0B",
    },
    blockOut: {
      type: String,
      default: "0B",
    },
    pids: {
      type: Number,
      default: 0,
    },
    restarts: {
      type: Number,
      default: 0,
    },
    uptime: {
      type: Number,
      default: 0, // in seconds
    },
    lastRestartTime: Date,
    lastHealthCheckTime: Date,
    healthCheckStatus: {
      success: {
        type: Boolean,
        default: false,
      },
      message: String,
      timestamp: Date,
    },
    events: [
      {
        type: {
          type: String,
          enum: ["start", "stop", "restart", "health_check", "error", "update"],
        },
        message: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      ports: [String],
      labels: mongoose.Schema.Types.Mixed,
      mounts: [
        {
          source: String,
          destination: String,
          type: String,
        },
      ],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for efficient querying
containerHealthSchema.index({ containerId: 1, createdAt: -1 });
containerHealthSchema.index({ status: 1, updatedAt: -1 });
containerHealthSchema.index({ health: 1, updatedAt: -1 });
containerHealthSchema.index({ createdAt: -1 });

// TTL index to automatically delete old records after 30 days
containerHealthSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const ContainerHealth = mongoose.model(
  "ContainerHealth",
  containerHealthSchema
);
