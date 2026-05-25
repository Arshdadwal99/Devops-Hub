import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import * as jenkinsController from "../controllers/jenkinsController.js";

const router = express.Router();

router.use(verifyToken);

/**
 * Jenkins Pipeline Endpoints
 * 
 * Used by frontend to interact with Jenkins builds
 */

// ============ Build Triggering ============

/**
 * POST /api/jenkins/trigger
 * Trigger a new Jenkins build
 * Body: { repository, commit, branch, environment?, cause? }
 */
router.post("/trigger", jenkinsController.triggerBuild);

/**
 * POST /api/jenkins/sync
 * Sync Jenkins builds with MongoDB
 * Query: limit (default: 50)
 */
router.post("/sync", jenkinsController.syncBuilds);

// ============ Pipeline Status ============

/**
 * GET /api/jenkins/pipeline/status
 * Get current pipeline status (running/idle/failed/success)
 */
router.get("/pipeline/status", jenkinsController.getPipelineStatus);

// ============ Build Status & Details ============

/**
 * GET /api/jenkins/builds/:buildNumber/status
 * Get build status by build number
 */
router.get("/builds/:buildNumber/status", jenkinsController.getBuildStatus);

/**
 * GET /api/jenkins/builds/:buildNumber
 * Get complete build details with logs and stages
 */
router.get("/builds/:buildNumber", jenkinsController.getBuildDetails);

/**
 * GET /api/jenkins/builds/:buildNumber/abort
 * Abort a running build
 */
router.post("/builds/:buildNumber/abort", jenkinsController.abortBuild);

// ============ Build Logs ============

/**
 * GET /api/jenkins/builds/:buildNumber/logs
 * Get build console logs
 * Query: start (default: 0) - byte offset for log streaming
 */
router.get("/builds/:buildNumber/logs", jenkinsController.getBuildLogs);

// ============ Build Stages & Progress ============

/**
 * GET /api/jenkins/builds/:buildNumber/stages
 * Get pipeline stages with progress information
 */
router.get("/builds/:buildNumber/stages", jenkinsController.getBuildStages);

// ============ Build History ============

/**
 * GET /api/jenkins/history
 * Get build history
 * Query: 
 *   - limit (default: 20)
 *   - skip (default: 0)
 *   - source (jenkins|db, default: db)
 */
router.get("/history", jenkinsController.getHistory);

/**
 * GET /api/jenkins/last-successful
 * Get last successful build
 */
router.get("/last-successful", jenkinsController.getLastSuccessful);

/**
 * GET /api/jenkins/builds/status/:status
 * Get builds by status (SUCCESS, FAILURE, RUNNING, etc.)
 * Query: limit (default: 20)
 */
router.get("/builds/status/:status", jenkinsController.getByStatus);

/**
 * GET /api/jenkins/builds/branch/:branch
 * Get builds from specific branch
 * Query: limit (default: 20)
 */
router.get("/builds/branch/:branch", jenkinsController.getByBranch);

// ============ Analytics & Statistics ============

/**
 * GET /api/jenkins/statistics
 * Get build statistics
 * Query: days (default: 30) - number of days to analyze
 */
router.get("/statistics", jenkinsController.getStatistics);

// ============ Deployment Tracking ============

/**
 * GET /api/jenkins/deployments/analytics
 * Get deployment analytics and success rates
 * Query: days (default: 30)
 */
router.get("/deployments/analytics", jenkinsController.getDeploymentAnalytics);

/**
 * GET /api/jenkins/deployments/:buildNumber
 * Get deployment status by build number
 */
router.get("/deployments/:buildNumber", jenkinsController.getDeploymentStatus);

/**
 * GET /api/jenkins/deployments
 * Get recent deployments from database
 * Query: limit (default: 20)
 */
router.get("/deployments", jenkinsController.getRecentDeployments);

/**
 * GET /api/jenkins/deployments/running
 * Get currently running deployments
 */
router.get("/deployments/running", jenkinsController.getRunningDeployments);

/**
 * POST /api/jenkins/deployments/sync
 * Sync Jenkins builds to deployment database
 * Body: { limit? } (default: 50)
 */
router.post("/deployments/sync", jenkinsController.syncAllBuilds);

export default router;
