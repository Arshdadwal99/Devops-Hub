import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { analyzeLogsWithAI, fallbackAnalysis } from "../services/aiAnalysisService.js";
import { preprocessLogs, extractMetrics } from "../utils/logPreprocessor.js";
import { LogAnalysis } from "../models/LogAnalysis.js";

const router = express.Router();

function toAnalysisContract(analysis, metrics = {}) {
  const suggestedFixes = analysis.suggested_fixes || analysis.suggestedFixes || [];
  const errorsDetected = analysis.errors_detected || analysis.errors || metrics.errorSamples || [];
  const warningsDetected = analysis.warnings_detected || analysis.warnings || metrics.warningSamples || [];

  return {
    errors_detected: Array.isArray(errorsDetected) ? errorsDetected : [String(errorsDetected)],
    warnings_detected: Array.isArray(warningsDetected) ? warningsDetected : [String(warningsDetected)],
    deployment_issues: analysis.deployment_issues || analysis.root_cause || "No deployment-specific issue detected",
    suggested_fixes: suggestedFixes,
    failure_probability: analysis.failure_probability,
    severity: analysis.severity,
    affected_stage: analysis.affected_stage,
    confidence: analysis.confidence,
    explanation: analysis.explanation,
  };
}

/**
 * POST /api/analyze (root endpoint)
 * Analyze CI/CD logs for failure prediction
 * Protected route - requires authentication
 */
router.post("/", verifyToken, async (req, res) => {
  try {
    const { logs, pipelineId = "default" } = req.body;

    // Validate input
    if (!logs || typeof logs !== "string" || logs.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "logs field is required and must be a non-empty string",
      });
    }

    if (logs.length > 1000000) {
      // 1MB limit
      return res.status(413).json({
        error: "Request entity too large",
        message: "Log file exceeds 1MB limit",
      });
    }

    console.log("📊 [Analyze] Analyzing logs for pipeline:", pipelineId);

    // Preprocess logs
    const preprocessed = preprocessLogs(logs);
    const metrics = extractMetrics(logs); // Pass original logs, not preprocessed object
    
    console.log("📈 Extracted metrics:", metrics);

    // Try AI analysis
    let analysis;
    try {
      analysis = await analyzeLogsWithAI(logs, metrics);
    } catch (aiError) {
      console.warn("⚠️  AI analysis failed, using fallback");
      analysis = fallbackAnalysis(logs, metrics);
    }

    // Ensure failure_probability is a valid number
    if (!analysis.failure_probability || isNaN(analysis.failure_probability)) {
      analysis.failure_probability = 50;
    }

    // Save analysis to database
    try {
      const result = new LogAnalysis({
        pipelineId,
        userId: req.user.userId,
        originalLogs: logs.substring(0, 50000), // Store first 50KB
        logMetrics: metrics,
        analysis,
        aiModel: "fallback",
        timestamp: new Date(),
      });

      await result.save();
      console.log("✅ Analysis saved successfully");
    } catch (dbError) {
      console.warn("⚠️  Failed to save to database:", dbError.message);
      // Still return analysis even if DB save fails
    }

    res.json({
      success: true,
      analysis,
      result: toAnalysisContract(analysis, metrics),
      metrics,
      message: "Log analysis completed successfully",
    });
  } catch (error) {
    console.error("❌ [Analyze] Error:", error.message);
    res.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/analyze/analyze-logs
 * Alternative endpoint for backwards compatibility
 */
router.post("/analyze-logs", verifyToken, async (req, res) => {
  try {
    const { logs, pipelineId = "default" } = req.body;

    // Validate input
    if (!logs || typeof logs !== "string" || logs.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "logs field is required and must be a non-empty string",
      });
    }

    if (logs.length > 1000000) {
      // 1MB limit
      return res.status(413).json({
        error: "Request entity too large",
        message: "Log file exceeds 1MB limit",
      });
    }

    const startTime = Date.now();
    let analysis;
    let usedFallback = false;

    try {
      // Preprocess logs
      const preprocessedLogs = preprocessLogs(logs);
      const metrics = extractMetrics(logs);

      // Call AI service
      analysis = await analyzeLogsWithAI(preprocessedLogs.summary, metrics);

      // Store metrics in analysis
      analysis.metrics = metrics;
    } catch (aiError) {
      console.warn("AI analysis failed, using fallback:", aiError.message);

      // Fallback to heuristic analysis
      const metrics = extractMetrics(logs);
      analysis = fallbackAnalysis(logs.substring(0, 5000), metrics);
      analysis.metrics = metrics;
      usedFallback = true;
    }

    const processingTime = Date.now() - startTime;

    // Save to database
    const logAnalysis = new LogAnalysis({
      userId: req.user.userId,
      pipelineId,
      originalLogs: logs.substring(0, 100000), // Store first 100KB
      logMetrics: analysis.metrics,
      analysis: {
        failure_probability: analysis.failure_probability,
        severity: analysis.severity,
        root_cause: analysis.root_cause,
        explanation: analysis.explanation,
        suggested_fixes: analysis.suggested_fixes,
        affected_stage: analysis.affected_stage,
        confidence: analysis.confidence,
      },
      usedFallback,
      processingTime,
    });

    await logAnalysis.save();

    // Return analysis
    res.json({
      success: true,
      analysis: {
        failure_probability: analysis.failure_probability,
        severity: analysis.severity,
        root_cause: analysis.root_cause,
        explanation: analysis.explanation,
        suggested_fixes: analysis.suggested_fixes,
        affected_stage: analysis.affected_stage,
        confidence: analysis.confidence,
      },
      result: toAnalysisContract(analysis, analysis.metrics),
      metadata: {
        processingTime,
        usedFallback,
        timestamp: new Date(),
        analysisId: logAnalysis._id,
      },
    });
  } catch (error) {
    console.error("Log analysis error:", error);

    // Try to save error to database
    try {
      await LogAnalysis.create({
        userId: req.user.id,
        pipelineId: req.body.pipelineId || "default",
        originalLogs: req.body.logs || "",
        status: "failed",
        errorMessage: error.message,
        logMetrics: {
          errorCount: 0,
          warningCount: 0,
          failureCount: 0,
          timeoutCount: 0,
          testCount: 0,
        },
      });
    } catch (dbError) {
      console.error("Failed to save error log:", dbError);
    }

    res.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/analyze-logs/history
 * Get user's analysis history
 * Protected route - requires authentication
 */
router.get("/analyze-logs/history", verifyToken, async (req, res) => {
  try {
    const { limit = 10, skip = 0 } = req.query;

    const analyses = await LogAnalysis.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await LogAnalysis.countDocuments({ userId: req.user.id });

    res.json({
      success: true,
      data: analyses,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch history",
      message: error.message,
    });
  }
});

/**
 * GET /api/analyze-logs/:id
 * Get specific analysis by ID
 * Protected route - requires authentication
 */
router.get("/analyze-logs/:id", verifyToken, async (req, res) => {
  try {
    const analysis = await LogAnalysis.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!analysis) {
      return res.status(404).json({
        error: "Not found",
        message: "Analysis not found or access denied",
      });
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error("Analysis fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch analysis",
      message: error.message,
    });
  }
});

export default router;
