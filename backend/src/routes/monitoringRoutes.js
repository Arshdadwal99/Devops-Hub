import express from "express";
import {
  getPipelineStatus,
  getDockerLogs,
  getSystemMetrics,
  getAlerts,
} from "../controllers/monitoringController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * GET /api/monitoring/pipeline-status
 * Get GitHub pipeline status
 */
router.get("/monitoring/pipeline-status", verifyToken, getPipelineStatus);

/**
 * GET /api/monitoring/logs
 * Get Docker container logs
 */
router.get("/monitoring/logs", verifyToken, getDockerLogs);

/**
 * GET /api/monitoring/metrics
 * Get system metrics (CPU, memory, uptime)
 */
router.get("/monitoring/metrics", verifyToken, getSystemMetrics);

/**
 * GET /api/monitoring/alerts
 * Get system alerts
 */
router.get("/monitoring/alerts", verifyToken, getAlerts);

export default router;
