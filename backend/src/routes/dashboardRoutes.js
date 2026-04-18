import express from "express";
import {
  fetchDashboard,
  restartContainers,
  triggerDeploy,
  triggerRollback,
} from "../services/dashboardService.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/pipeline-status", async (_req, res, next) => {
  try {
    const dashboard = await fetchDashboard();
    res.json(dashboard.pipeline);
  } catch (error) {
    next(error);
  }
});

router.get("/metrics", async (_req, res, next) => {
  try {
    const dashboard = await fetchDashboard();
    res.json(dashboard.metrics);
  } catch (error) {
    next(error);
  }
});

router.get("/logs", async (_req, res, next) => {
  try {
    const dashboard = await fetchDashboard();
    res.json(dashboard.logs);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", async (_req, res, next) => {
  try {
    const dashboard = await fetchDashboard();
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.post("/deploy", async (_req, res, next) => {
  try {
    const dashboard = await triggerDeploy();
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.post("/rollback", async (_req, res, next) => {
  try {
    const dashboard = await triggerRollback();
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.post("/restart", async (_req, res, next) => {
  try {
    const dashboard = await restartContainers();
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

export default router;
