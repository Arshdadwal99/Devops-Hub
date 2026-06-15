import express from "express";
import {
  recalculateDeploymentWorkflowState,
} from "../services/workflowStateService.js";

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?.uid || req.user?.id || "system";
}

/**
 * POST /api/workflow/recalculate
 * Rebuild a deployment workflow from actual connected resources.
 */
router.post("/recalculate", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { deploymentId } = req.body || {};

    if (!deploymentId || typeof deploymentId !== "string") {
      return res.status(400).json({
        success: false,
        error: "deploymentId is required",
      });
    }

    const result = await recalculateDeploymentWorkflowState({
      userId,
      deploymentId: deploymentId.trim(),
      persist: true,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Deployment workspace not found",
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
