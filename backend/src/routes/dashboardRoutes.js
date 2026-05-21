import express from "express";
import {
  fetchDashboard,
  restartContainers,
  triggerDeploy,
  triggerRollback,
} from "../services/dashboardService.js";

const router = express.Router();

// Root dashboard endpoint - returns complete dashboard with real data
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const dashboard = await fetchDashboard(userId);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
router.get("/health", (_req, res) => {
  res.json({ ok: true, message: "Dashboard service is healthy" });
});

// Get pipeline status from real Jenkins data
router.get("/pipeline-status", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const dashboard = await fetchDashboard(userId);
    res.json(dashboard.pipeline);
  } catch (error) {
    next(error);
  }
});

// Get current metrics
router.get("/metrics", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const dashboard = await fetchDashboard(userId);
    res.json(dashboard.metrics);
  } catch (error) {
    next(error);
  }
});

// Get recent logs
router.get("/logs", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const dashboard = await fetchDashboard(userId);
    res.json(dashboard.logs);
  } catch (error) {
    next(error);
  }
});

// Get recent alerts
router.get("/alerts", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const dashboard = await fetchDashboard(userId);
    res.json(dashboard.alerts);
  } catch (error) {
    next(error);
  }
});

// Trigger manual deployment
router.post("/deploy", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { version, containerName, image, environment } = req.body;

    const deployment = await triggerDeploy(userId, {
      version,
      containerName,
      image,
      environment,
    });

    // Return updated dashboard
    const dashboard = await fetchDashboard(userId);
    res.json({ success: true, deployment, dashboard });
  } catch (error) {
    next(error);
  }
});

// Trigger rollback
router.post("/rollback", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { containerName, previousVersion, reason } = req.body;

    const deployment = await triggerRollback(userId, {
      containerName,
      previousVersion,
      reason,
    });

    // Return updated dashboard
    const dashboard = await fetchDashboard(userId);
    res.json({ success: true, deployment, dashboard });
  } catch (error) {
    next(error);
  }
});

// Trigger container restart
router.post("/restart", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { containerName } = req.body;

    const dashboard = await restartContainers(userId, containerName);
    res.json({ success: true, dashboard });
  } catch (error) {
    next(error);
  }
});

export default router;
