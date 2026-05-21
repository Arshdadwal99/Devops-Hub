import mongoose from "mongoose";

const metricsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    cpu: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    memory: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    disk: {
      type: Number,
      min: 0,
      max: 100,
    },
    network: {
      incoming: Number, // bytes per second
      outgoing: Number, // bytes per second
    },
    uptime: Number, // seconds
    latency: {
      type: Number,
      default: 0,
    }, // milliseconds
    activeConnections: Number,
    requestsPerSecond: Number,
    containerCount: Number,
    containerHealth: {
      running: Number,
      stopped: Number,
      failed: Number,
    },
    systemLoad: {
      load1: Number,
      load5: Number,
      load15: Number,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// TTL index - keep metrics for 30 days
metricsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });
metricsSchema.index({ userId: 1, timestamp: -1 });

export const Metrics = mongoose.model("Metrics", metricsSchema);
