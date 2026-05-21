import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    requestsPerSecond: {
      type: Number,
      default: 0,
    },
    requestsPerMinute: {
      type: Number,
      default: 0,
    },
    requestsPerHour: {
      type: Number,
      default: 0,
    },
    averageResponseTime: {
      type: Number,
      default: 0,
    }, // milliseconds
    byMethod: {
      GET: Number,
      POST: Number,
      PUT: Number,
      DELETE: Number,
      PATCH: Number,
    },
    byEndpoint: {
      type: Map,
      of: Number,
    },
    byStatusCode: {
      "2xx": Number,
      "3xx": Number,
      "4xx": Number,
      "5xx": Number,
    },
    errors: Number,
    bandwidth: Number, // bytes
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// TTL index - keep traffic data for 7 days
trafficSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });
trafficSchema.index({ userId: 1, timestamp: -1 });

export const Traffic = mongoose.model("Traffic", trafficSchema);
