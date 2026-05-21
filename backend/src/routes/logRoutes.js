import express from "express";
import { Log } from "../models/Logs.js";

const router = express.Router();

/**
 * GET /api/logs
 * Fetch Jenkins, Docker, deployment, rollback, error, and application logs.
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const {
      source,
      type,
      buildNumber,
      deploymentId,
      containerName,
      limit = 100,
      skip = 0,
    } = req.query;

    const query = { userId };
    if (source) query.source = source;
    if (type) query.logType = type;
    if (buildNumber) query.buildNumber = Number(buildNumber);
    if (deploymentId) query.deploymentId = deploymentId;
    if (containerName) query.containerName = containerName;

    const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const safeSkip = parseInt(skip, 10) || 0;

    const [logs, total] = await Promise.all([
      Log.find(query).sort({ timestamp: -1, createdAt: -1 }).limit(safeLimit).skip(safeSkip).lean(),
      Log.countDocuments(query),
    ]);

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
