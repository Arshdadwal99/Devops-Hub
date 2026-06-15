import express from "express";
import {
  generateCicdPipeline,
  getCicdPipelineStatus,
  previewCicdPipeline,
} from "../services/cicdPipelineGeneratorService.js";
import { getJenkinsStatus, jenkinsValidationPassed } from "../services/jenkinsConnectionService.js";

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?.uid || req.user?._id || "system";
}

function validateRepositoryInput(req, res) {
  const { owner, repo } = req.body;

  if (!owner || typeof owner !== "string") {
    res.status(400).json({ success: false, message: "owner is required" });
    return false;
  }

  if (!repo || typeof repo !== "string") {
    res.status(400).json({ success: false, message: "repo is required" });
    return false;
  }

  return true;
}

router.post("/preview", async (req, res) => {
  try {
    if (!validateRepositoryInput(req, res)) return;

    const result = await previewCicdPipeline(getUserId(req), {
      owner: req.body.owner.trim(),
      repo: req.body.repo.trim(),
      branch: req.body.branch || "main",
    });

    res.json(result);
  } catch (error) {
    console.error("[CI/CD] Preview failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

router.post("/generate", async (req, res) => {
  try {
    if (!validateRepositoryInput(req, res)) return;

    const jenkins = await getJenkinsStatus(getUserId(req));
    if (!jenkinsValidationPassed(jenkins.status)) {
      return res.status(409).json({
        success: false,
        message: "Connect Jenkins before generating the CI/CD pipeline.",
      });
    }

    const result = await generateCicdPipeline(getUserId(req), {
      owner: req.body.owner.trim(),
      repo: req.body.repo.trim(),
      branch: req.body.branch || "main",
      workflow: req.body.workflow,
    });

    res.json(result);
  } catch (error) {
    console.error("[CI/CD] Generation failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const result = await getCicdPipelineStatus(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[CI/CD] Status failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
