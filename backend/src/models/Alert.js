import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "deployment_failed",
        "deployment_success",
        "deployment_auto_failed",
        "deployment_auto_success",
        "cpu_high",
        "memory_high",
        "disk_high",
        "container_stopped",
        "pipeline_failed",
        "pipeline_success",
        "docker_build_failed",
        "jenkins_build_failed",
        "health_check_failed",
        "custom",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    resourceType: {
      type: String,
      enum: ["pipeline", "container", "deployment", "system", "webhook"],
      default: "system",
    },
    resourceId: String,
    metadata: {
      cpu: Number,
      memory: Number,
      threshold: Number,
      container: String,
      version: String,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: Date,
    resolvedBy: String,
    action: String,
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

alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ severity: 1, resolved: 1 });
alertSchema.index({ type: 1 });

export const Alert = mongoose.model("Alert", alertSchema);
