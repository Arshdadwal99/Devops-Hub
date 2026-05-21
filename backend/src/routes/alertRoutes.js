import express from "express";
import {
  createAlert,
  getAlerts,
  resolveAlert,
  deleteAlert,
  getAlertStats,
} from "../services/alertService.js";

const router = express.Router();

/**
 * GET /api/alerts
 * Get alerts
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const {
      severity = null,
      type = null,
      resolved = false,
      limit = 50,
      skip = 0,
    } = req.query;

    const result = await getAlerts(userId, {
      severity,
      type,
      resolved: resolved === "true" ? true : false,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alerts/stats
 * Get alert statistics
 */
router.get("/stats", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const result = await getAlertStats(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts
 * Create alert
 */
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.uid;
    const result = await createAlert(userId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/alerts/:id/resolve
 * Resolve alert
 */
router.put("/:id/resolve", async (req, res, next) => {
  try {
    const { action } = req.body;
    const resolvedBy = req.user.email || req.user.uid;

    const result = await resolveAlert(req.params.id, resolvedBy, action);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete alert
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const result = await deleteAlert(req.params.id);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
