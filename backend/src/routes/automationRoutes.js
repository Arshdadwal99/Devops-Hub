import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { Deployment } from "../models/Deployment.js";
import deploymentOrchestrationService from "../services/deploymentOrchestrationService.js";
import ec2Service from "../services/ec2AutomatedDeploymentService.js";
import { detectTechStack } from "../services/techStackDetectorService.js";
import { retryHealthCheck } from "../services/healthCheckService.js";

const router = express.Router();

/**
 * POST /api/automation/deploy
 * Trigger fully automated deployment
 */
router.post("/deploy", verifyToken, async (req, res) => {
  try {
    const { repositoryUrl, containerName = "devops-app", containerPort = 3000 } = req.body;

    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        error: "repositoryUrl is required",
      });
    }

    // Start deployment in background
    const deploymentId = `deploy-${Date.now()}`;

    // Execute deployment asynchronously
    deploymentOrchestrationService
      .executeFullAutomatedDeployment({
        repository: { clone_url: repositoryUrl, name: containerName, id: Date.now() },
        ref: "refs/heads/main",
        after: "latest",
        _id: deploymentId,
      })
      .catch((error) => {
        console.error("Background deployment error:", error);
      });

    res.json({
      success: true,
      deploymentId,
      message: "Deployment started. Monitor progress with deployment ID.",
    });
  } catch (error) {
    console.error("Deployment error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/automation/deployment/:deploymentId
 * Get deployment status
 */
router.get("/deployment/:deploymentId", verifyToken, async (req, res) => {
  try {
    const { deploymentId } = req.params;

    // Try to get from database first
    const deployment = await Deployment.findById(deploymentId);
    if (deployment) {
      return res.json({
        success: true,
        deployment,
      });
    }

    res.status(404).json({
      success: false,
      error: "Deployment not found",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/automation/deployments
 * Get all deployments
 */
router.get("/deployments", verifyToken, async (req, res) => {
  try {
    const deployments = await Deployment.find()
      .sort({ startTime: -1 })
      .limit(50);

    res.json({
      success: true,
      total: deployments.length,
      deployments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/automation/deployments/stats
 * Get deployment statistics
 */
router.get("/deployments/stats", verifyToken, async (req, res) => {
  try {
    const total = await Deployment.countDocuments();
    const successful = await Deployment.countDocuments({ status: "success" });
    const failed = await Deployment.countDocuments({ status: "failed" });
    const inProgress = await Deployment.countDocuments({ status: "in-progress" });

    const avgDuration = await Deployment.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, avgDuration: { $avg: "$duration" } } },
    ]);

    res.json({
      success: true,
      stats: {
        total,
        successful,
        failed,
        inProgress,
        successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + "%" : "0%",
        avgDuration: avgDuration[0]?.avgDuration || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/automation/detect-stack
 * Detect tech stack from repository
 */
router.post("/detect-stack", verifyToken, async (req, res) => {
  try {
    const { repositoryUrl } = req.body;

    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        error: "repositoryUrl is required",
      });
    }

    // Clone and detect
    const repoName = repositoryUrl.split("/").pop().replace(".git", "");
    const repoPath = `/tmp/${repoName}-${Date.now()}`;

    try {
      const { execSync } = await import("child_process");
      execSync(`git clone ${repositoryUrl} ${repoPath}`);

      const detection = await detectTechStack(repoPath);

      // Cleanup
      execSync(`rm -rf ${repoPath}`);

      res.json({
        success: true,
        detection: detection.detection,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/automation/health-check
 * Check health of deployed container
 */
router.post("/health-check", verifyToken, async (req, res) => {
  try {
    const { containerName, port } = req.body;

    if (!containerName || !port) {
      return res.status(400).json({
        success: false,
        error: "containerName and port are required",
      });
    }

    const result = await retryHealthCheck(containerName, port, 3, 1000);

    res.json({
      success: result.success,
      result: result.result,
      attempts: result.attempts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/automation/ec2-deploy
 * Deploy to specific EC2 instance
 */
router.post("/ec2-deploy", verifyToken, async (req, res) => {
  try {
    const {
      containerName,
      containerPort = 3000,
      dockerImage,
      repositoryUrl,
      buildNumber,
    } = req.body;

    if (!dockerImage) {
      return res.status(400).json({
        success: false,
        error: "dockerImage is required",
      });
    }

    const deploymentId = `ec2-deploy-${Date.now()}`;

    // Start deployment
    const result = await ec2Service.deployToEc2({
      deploymentId,
      containerName,
      containerPort,
      dockerImage,
      repository: repositoryUrl,
      buildNumber,
    });

    if (result.success) {
      res.json({
        success: true,
        ...result,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        logs: result.logs,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/automation/ec2-config
 * Check EC2 configuration
 */
router.get("/ec2-config", verifyToken, async (req, res) => {
  try {
    const config = {
      host: process.env.AWS_EC2_HOST ? "configured" : "missing",
      keyPath: process.env.AWS_EC2_KEY_PATH ? "configured" : "missing",
      user: process.env.AWS_EC2_USER || "ubuntu",
      region: process.env.AWS_REGION || "us-east-1",
    };

    res.json({
      success: true,
      config,
      ready: config.host === "configured" && config.keyPath === "configured",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/automation/rollback/:deploymentId
 * Rollback to previous deployment
 */
router.post("/rollback/:deploymentId", verifyToken, async (req, res) => {
  try {
    const { deploymentId } = req.params;

    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment not found",
      });
    }

    // Find previous successful deployment
    const previousDeployment = await Deployment.findOne({
      _id: { $ne: deploymentId },
      status: "success",
      createdAt: { $lt: deployment.createdAt },
    })
      .sort({ createdAt: -1 })
      .limit(1);

    if (!previousDeployment) {
      return res.status(404).json({
        success: false,
        error: "No previous deployment found to rollback to",
      });
    }

    // Create rollback deployment
    const rollbackDeployment = await Deployment.create({
      userId: deployment.userId,
      version: previousDeployment.version,
      previousVersion: deployment.version,
      status: "in-progress",
      environment: deployment.environment,
      deploymentType: "rollback",
      deployedBy: req.user?.email || "system",
      startTime: new Date(),
      containers: previousDeployment.containers,
      logs: ["Initiating rollback..."],
    });

    // Perform rollback using docker compose
    try {
      const { execSync } = await import("child_process");

      // Stop current containers
      execSync("docker compose down || true");

      // Start previous version
      execSync(`docker run -d --name app ${previousDeployment.containers[0].image}`);

      rollbackDeployment.status = "success";
      rollbackDeployment.endTime = new Date();
      rollbackDeployment.logs.push("✅ Rollback successful");
      await rollbackDeployment.save();

      res.json({
        success: true,
        rollbackDeploymentId: rollbackDeployment._id,
        previousVersion: previousDeployment.version,
      });
    } catch (error) {
      rollbackDeployment.status = "failed";
      rollbackDeployment.endTime = new Date();
      rollbackDeployment.deploymentError = error.message;
      rollbackDeployment.logs.push(`❌ Rollback failed: ${error.message}`);
      await rollbackDeployment.save();

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
