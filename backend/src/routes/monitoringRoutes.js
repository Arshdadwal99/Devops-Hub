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
 * GET /api/monitoring (root)
 * Get all monitoring data
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const [status, metrics, logs, alerts] = await Promise.all([
      getPipelineStatus(req, res),
      getSystemMetrics(req, res),
      getDockerLogs(req, res),
      getAlerts(req, res),
    ]).catch(() => [{}, {}, {}, {}]);

    res.json({
      status,
      metrics,
      logs,
      alerts,
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/pipeline-status
 * Get GitHub pipeline status
 */
router.get("/pipeline-status", verifyToken, getPipelineStatus);

/**
 * GET /api/monitoring/logs
 * Get Docker container logs
 */
router.get("/logs", verifyToken, getDockerLogs);

/**
 * GET /api/monitoring/metrics
 * Get system metrics (CPU, memory, uptime)
 */
router.get("/metrics", verifyToken, getSystemMetrics);

/**
 * GET /api/monitoring/alerts
 * Get system alerts
 */
router.get("/alerts", verifyToken, getAlerts);

export default router;
