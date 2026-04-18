import mongoose from "mongoose";

const logAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pipelineId: {
      type: String,
      required: true,
    },
    originalLogs: {
      type: String,
      required: true,
    },
    logMetrics: {
      errorCount: { type: Number, default: 0 },
      warningCount: { type: Number, default: 0 },
      failureCount: { type: Number, default: 0 },
      timeoutCount: { type: Number, default: 0 },
      testCount: { type: Number, default: 0 },
      totalLines: { type: Number, default: 0 },
    },
    analysis: {
      failure_probability: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      severity: {
        type: String,
        enum: ["Low", "Medium", "High", "Critical"],
        required: true,
      },
      root_cause: {
        type: String,
        required: true,
      },
      explanation: {
        type: String,
        required: true,
      },
      suggested_fixes: [String],
      affected_stage: {
        type: String,
        enum: ["build", "test", "deploy", "integration"],
        default: "build",
      },
      confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 75,
      },
    },
    aiModel: {
      type: String,
      default: "gpt-4-turbo-preview",
    },
    usedFallback: {
      type: Boolean,
      default: false,
    },
    processingTime: {
      type: Number, // milliseconds
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    errorMessage: String,
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
logAnalysisSchema.index({ userId: 1, createdAt: -1 });
logAnalysisSchema.index({ pipelineId: 1, createdAt: -1 });
logAnalysisSchema.index({ "analysis.severity": 1 });

export const LogAnalysis = mongoose.model(
  "LogAnalysis",
  logAnalysisSchema
);
