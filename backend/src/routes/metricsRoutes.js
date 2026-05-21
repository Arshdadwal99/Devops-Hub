import express from "express";
import { getSystemMetrics, getMetricsHistory } from "../services/metricsService.js";
import { getContainers, getDockerInfo } from "../services/dockerService.js";
import { getPipelineStatus, getLastSuccessfulBuild, getBuildHistory } from "../services/jenkinsService.js";
import { Pipeline } from "../models/Pipeline.js";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";

const router = express.Router();

/**
 * GET /api/dashboard
 * Comprehensive dashboard data
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;

    // Gather all data in parallel
    const [
      metrics,
      jenkinsStatus,
      containers,
      pipelineHistory,
      recentLogs,
    ] = await Promise.all([
      getSystemMetrics(userId),
      getPipelineStatus(),
      getContainers(),
      Pipeline.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
      Log.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const dashboard = {
      status: "healthy",
      timestamp: new Date(),
      metrics: {
        cpu: metrics.cpu,
        memory: metrics.memory,
        disk: metrics.disk,
        uptime: metrics.uptime,
        latency: metrics.latency,
        containers: {
          running: metrics.containerHealth.running,
          stopped: metrics.containerHealth.stopped,
          failed: metrics.containerHealth.failed,
          total: metrics.containerCount,
        },
      },
      pipeline: {
        status: jenkinsStatus.status,
        progress: jenkinsStatus.progress,
        lastBuild: jenkinsStatus.lastBuild,
        lastCompleted: jenkinsStatus.lastCompletedBuild,
      },
      docker: {
        containers: containers.total,
        running: containers.containers.filter(c => c.State === "running").length,
        stopped: containers.containers.filter(c => c.State === "exited").length,
      },
      recentPipelines: pipelineHistory,
      recentLogs: recentLogs.slice(0, 5),
    };

    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/metrics
 * System metrics
 */
router.get("/metrics", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const metrics = await getSystemMetrics(userId);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/metrics/history
 * Metrics history
 */
router.get("/metrics/history", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const duration = parseInt(req.query.duration) || 3600000; // 1 hour default

    const result = await getMetricsHistory(userId, duration);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/pipeline
 * Pipeline status
 */
router.get("/pipeline", async (req, res, next) => {
  try {
    const status = await getPipelineStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/pipeline/builds
 * Build history
 */
router.get("/pipeline/builds", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await getBuildHistory(limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/pipeline/last-successful
 * Last successful build
 */
router.get("/pipeline/last-successful", async (req, res, next) => {
  try {
    const result = await getLastSuccessfulBuild();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/containers
 * Docker containers
 */
router.get("/containers", async (req, res, next) => {
  try {
    const result = await getContainers();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/docker-info
 * Docker system info
 */
router.get("/docker-info", async (req, res, next) => {
  try {
    const result = await getDockerInfo();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/deployments
 * Deployment history
 */
router.get("/deployments", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    const deployments = await Deployment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Deployment.countDocuments({ userId });

    res.json({
      success: true,
      deployments,
      total,
      count: deployments.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/logs
 * Recent logs
 */
router.get("/logs", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const logType = req.query.type;

    const query = { userId };
    if (logType) query.logType = logType;

    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Log.countDocuments(query);

    res.json({
      success: true,
      logs,
      total,
      count: logs.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
