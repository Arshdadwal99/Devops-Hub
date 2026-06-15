import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  getContainersList,
  getAllStats,
  getStats,
  getHealth,
  getHealthHistory,
  getLogs,
  getInfo,
  getStatus,
  restartContainerHandler,
  stopContainerHandler,
  removeContainerHandler,
  deployContainerHandler,
  getDeployments,
  getDeploymentStatsHandler,
} from "../controllers/dockerController.js";

const router = express.Router();

router.use(verifyToken);

/**
 * Docker Container Management APIs
 */

/**
 * GET /api/docker/containers
 * Get list of all containers
 */
router.get("/containers", getContainersList);

/**
 * GET /api/docker/containers/stats
 * Get stats for all containers
 */
router.get("/containers/stats", getAllStats);

/**
 * GET /api/docker/containers/:containerId/stats
 * Get stats for specific container
 */
router.get("/containers/:containerId/stats", getStats);

/**
 * GET /api/docker/containers/:containerId/health
 * Get container health status
 */
router.get("/containers/:containerId/health", getHealth);

/**
 * GET /api/docker/containers/:containerId/health/history
 * Get container health history
 */
router.get("/containers/:containerId/health/history", getHealthHistory);

/**
 * GET /api/docker/containers/:containerId/logs
 * Get container logs
 */
router.get("/containers/:containerId/logs", getLogs);

/**
 * POST /api/docker/containers/:containerId/restart
 * Restart container
 */
router.post("/containers/:containerId/restart", restartContainerHandler);

/**
 * POST /api/docker/containers/:containerId/stop
 * Stop container
 */
router.post("/containers/:containerId/stop", stopContainerHandler);

/**
 * POST /api/docker/containers/:containerId/remove
 * Remove container
 */
router.post("/containers/:containerId/remove", removeContainerHandler);

/**
 * GET /api/docker/info
 * Get Docker system information
 */
router.get("/info", getInfo);

/**
 * GET /api/docker/status
 * Check Docker daemon connectivity
 */
router.get("/status", getStatus);

/**
 * Deployment Management APIs
 */

/**
 * POST /api/docker/deploy
 * Deploy container (stop old, run new, record history)
 */
router.post("/deploy", deployContainerHandler);

/**
 * GET /api/docker/deployments
 * Get deployment history for user
 */
router.get("/deployments", getDeployments);

/**
 * GET /api/docker/deployments/stats
 * Get deployment statistics
 */
router.get("/deployments/stats", getDeploymentStatsHandler);

export default router;
