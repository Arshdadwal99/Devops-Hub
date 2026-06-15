import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { analyzeRepository } from "../services/repositoryAnalysisService.js";
import { generateConfiguration } from "../services/configGeneratorService.js";

const router = express.Router();

/**
 * POST /api/repositories/analyze
 * Analyze a GitHub repository for deployment readiness
 * Requires: Authentication token in header
 * Body: { owner: string, repo: string }
 */
router.post("/analyze", verifyToken, async (req, res, next) => {
  try {
    const { owner, repo } = req.body;

    // Validate input
    if (!owner || typeof owner !== "string" || owner.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        message: "owner field is required and must be a non-empty string",
      });
    }

    if (!repo || typeof repo !== "string" || repo.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        message: "repo field is required and must be a non-empty string",
      });
    }

    console.log(`🔍 [Repository Analyze] Request from user: ${req.user.userId}`);
    console.log(`📦 Repository: ${owner}/${repo}`);

    // Analyze repository
    const result = await analyzeRepository(req.user.userId, owner, repo);

    res.json(result);
  } catch (error) {
    console.error("❌ [Repository Analyze] Error:", error.message);
    res.status(400).json({
      success: false,
      error: "Analysis failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/repositories/generate-config
 * Generate Dockerfile and Jenkinsfile for a repository
 * Requires: Authentication token in header
 * Body: { owner: string, repo: string, analysis: object }
 */
router.post("/generate-config", verifyToken, async (req, res, next) => {
  try {
    const { owner, repo, analysis } = req.body;

    // Validate input
    if (!owner || typeof owner !== "string" || owner.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        message: "owner field is required and must be a non-empty string",
      });
    }

    if (!repo || typeof repo !== "string" || repo.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        message: "repo field is required and must be a non-empty string",
      });
    }

    if (!analysis || typeof analysis !== "object") {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        message: "analysis object is required",
      });
    }

    console.log(`🔧 [Config Generator] Request from user: ${req.user.userId}`);
    console.log(`📦 Repository: ${owner}/${repo}`);

    // Generate configuration
    const result = await generateConfiguration(owner, repo, analysis);

    res.json(result);
  } catch (error) {
    console.error("❌ [Config Generator] Error:", error.message);
    res.status(400).json({
      success: false,
      error: "Configuration generation failed",
      message: error.message,
    });
  }
});

export default router;
