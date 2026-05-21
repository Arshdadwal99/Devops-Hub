import express from "express";
import { deployContainer, stopContainer, getContainers, runContainer, getContainerLogs, restartContainer } from "../services/dockerService.js";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";
import { Alert } from "../models/Alert.js";
import { createAlert } from "../services/alertService.js";
import { deployGitHubRepository } from "../services/githubPipelineService.js";
import { deployDockerImageToEc2 } from "../services/ec2DeploymentService.js";

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?.uid || req.user?.id || "system";
}

function getDefaultContainerName() {
  return process.env.CONTAINER_NAME || process.env.WEBHOOK_CONTAINER_NAME || "devops-hub";
}

function getDefaultImage() {
  return process.env.CONTAINER_IMAGE || process.env.WEBHOOK_CONTAINER_IMAGE || "devops-hub:latest";
}

function splitCsv(value, fallback = []) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
}

/**
 * POST /api/deployments/from-github
 * Clone a GitHub repo, build its Docker image, and run it as a container.
 */
router.post("/from-github", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await deployGitHubRepository({
      ...req.body,
      userId,
      deployedBy: req.user?.email || "api-user",
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/ec2
 * Deploy an existing Docker image to AWS EC2 over SSH.
 */
router.post("/ec2", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await deployDockerImageToEc2({
      ...req.body,
      userId,
      deployedBy: req.user?.email || "api-user",
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/deploy
 * Deploy new version
 */
router.post("/deploy", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const {
      containerName = getDefaultContainerName(),
      image = getDefaultImage(),
      ports,
      env,
      volumes,
      version = image,
    } = req.body;

    if (!containerName || !image || !version) {
      return res.status(400).json({
        success: false,
        error: "Missing deployment target. Set CONTAINER_NAME and CONTAINER_IMAGE or pass containerName, image, and version.",
      });
    }

    console.log(`🚀 [Deployment] Starting deployment: ${version}`);

    // Find old container
    const containersResult = await getContainers();
    let oldContainerId = null;

    if (containersResult.success && containersResult.containers) {
      const oldContainer = containersResult.containers.find(
        c => c.Names?.includes(`/${containerName}`) || c.Names?.includes(containerName)
      );
      if (oldContainer) {
        oldContainerId = oldContainer.ID;
      }
    }

    // Create deployment record
    const deployment = await Deployment.create({
      userId,
      version,
      status: "in-progress",
      deploymentType: "manual",
      deployedBy: req.user?.email || "api-user",
      startTime: new Date(),
      containers: [{ name: containerName, image, status: "pending" }],
    });

    // Perform deployment
    const deployResult = await deployContainer({
      oldContainerId,
      image,
      newContainerName: `${containerName}-${Date.now()}`,
      ports: splitCsv(ports, splitCsv(process.env.CONTAINER_PORTS || process.env.WEBHOOK_CONTAINER_PORTS, ["3000:3000"])),
      env: splitCsv(env, splitCsv(process.env.CONTAINER_ENV || process.env.WEBHOOK_CONTAINER_ENV, ["NODE_ENV=production"])),
      volumes: splitCsv(volumes, splitCsv(process.env.CONTAINER_VOLUMES || process.env.WEBHOOK_CONTAINER_VOLUMES, [])),
      userId,
    });

    // Update deployment record
    if (deployResult.success) {
      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "success",
        endTime: new Date(),
        duration: Date.now() - deployment.startTime,
        logs: deployResult.logs,
        containers: [
          {
            name: containerName,
            image,
            status: "running",
          },
        ],
      });

      // Create success alert
      await createAlert(userId, {
        type: "deployment_success",
        severity: "info",
        title: `Deployment Successful: ${version}`,
        message: `Version ${version} deployed successfully to ${containerName}`,
        resourceType: "deployment",
        resourceId: deployment._id.toString(),
        metadata: { version },
      });

      console.log(`✅ [Deployment] Deployment completed: ${version}`);

      res.json({
        success: true,
        deployment: await Deployment.findById(deployment._id),
        logs: deployResult.logs,
      });
    } else {
      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "failed",
        endTime: new Date(),
        duration: Date.now() - deployment.startTime,
        logs: deployResult.logs,
      });

      // Create failure alert
      await createAlert(userId, {
        type: "deployment_failed",
        severity: "critical",
        title: `Deployment Failed: ${version}`,
        message: `Deployment of version ${version} failed: ${deployResult.error}`,
        resourceType: "deployment",
        resourceId: deployment._id.toString(),
        metadata: { version, error: deployResult.error },
      });

      console.log(`❌ [Deployment] Deployment failed: ${version}`);

      res.status(500).json({
        success: false,
        error: deployResult.error,
        deployment: await Deployment.findById(deployment._id),
        logs: deployResult.logs,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/restart
 * Restart container
 */
router.post("/restart", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { containerName = getDefaultContainerName(), timeout = 10 } = req.body || {};

    console.log(`🔄 [Deployment] Restarting container: ${containerName}`);

    const containersResult = await getContainers();
    const container = containersResult.containers?.find(
      c => c.Names?.includes(`/${containerName}`) || c.Names?.includes(containerName)
    );

    if (!container) {
      return res.status(404).json({
        success: false,
        error: "Container not found",
      });
    }

    // Create logs for restart
    const logs = [
      `[${new Date().toISOString()}] Starting container restart...`,
      `[${new Date().toISOString()}] Restarting container: ${container.ID}`,
    ];

    const restartResult = await restartContainer(container.ID, timeout);

    if (restartResult.success) {
      logs.push(`[${new Date().toISOString()}] Container restarted successfully`);

      await Log.create({
        userId,
        source: "docker",
        logType: "info",
        containerName,
        message: "Container restart successful",
        rawLog: logs.join("\n"),
        metadata: { action: "restart" },
      });

      res.json({
        success: true,
        container: {
          name: containerName,
          status: "running",
        },
        logs,
      });
    } else {
      logs.push(`[${new Date().toISOString()}] Container restart failed: ${restartResult.error}`);

      await Log.create({
        userId,
        source: "docker",
        logType: "error",
        containerName,
        message: "Container restart failed",
        rawLog: logs.join("\n"),
        metadata: { action: "restart", error: restartResult.error },
      });

      res.status(500).json({
        success: false,
        error: restartResult.error,
        logs,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/rollback
 * Rollback to previous version
 */
router.post("/rollback", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { containerName = getDefaultContainerName() } = req.body || {};
    let { previousVersion } = req.body || {};

    if (!previousVersion) {
      const lastSuccessful = await Deployment.findOne({
        userId,
        status: "success",
        deploymentType: { $ne: "rollback" },
      })
        .sort({ createdAt: -1 })
        .lean();
      previousVersion = lastSuccessful?.previousVersion || lastSuccessful?.version || process.env.ROLLBACK_VERSION;
    }

    if (!containerName || !previousVersion) {
      return res.status(400).json({
        success: false,
        error: "Missing rollback target. Pass previousVersion or set ROLLBACK_VERSION / keep successful deployment history.",
      });
    }

    console.log(`⏮️ [Deployment] Rolling back to: ${previousVersion}`);

    const logs = [
      `[${new Date().toISOString()}] Starting rollback to ${previousVersion}...`,
    ];

    // Get current container
    const containersResult = await getContainers();
    const currentContainer = containersResult.containers?.find(
      c => c.Names?.includes(`/${containerName}`) || c.Names?.includes(containerName)
    );

    if (!currentContainer) {
      return res.status(404).json({
        success: false,
        error: "Container not found",
      });
    }

    // Create deployment record for rollback
    const deployment = await Deployment.create({
      userId,
      version: previousVersion,
      status: "in-progress",
      deploymentType: "rollback",
      deployedBy: req.user?.email || "api-user",
      startTime: new Date(),
    });

    logs.push(`[${new Date().toISOString()}] Stopping current container...`);
    await stopContainer(currentContainer.ID);
    logs.push(`[${new Date().toISOString()}] Container stopped`);
    await removeContainer(currentContainer.ID, true);
    logs.push(`[${new Date().toISOString()}] Current container removed`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    logs.push(`[${new Date().toISOString()}] Starting previous version...`);

    const runResult = await runContainer({
      image: `${currentContainer.Image.split(":")[0]}:${previousVersion}`,
      name: containerName,
      ports: splitCsv(req.body?.ports, splitCsv(process.env.CONTAINER_PORTS || process.env.WEBHOOK_CONTAINER_PORTS, ["3000:3000"])),
      env: splitCsv(req.body?.env, splitCsv(process.env.CONTAINER_ENV || process.env.WEBHOOK_CONTAINER_ENV, ["NODE_ENV=production"])),
      detach: true,
    });

    if (runResult.success) {
      logs.push(`[${new Date().toISOString()}] Rollback completed successfully`);

      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "success",
        endTime: new Date(),
        duration: Date.now() - deployment.startTime,
        logs,
      });

      await createAlert(userId, {
        type: "deployment_success",
        severity: "warning",
        title: `Rollback Completed: ${previousVersion}`,
        message: `Successfully rolled back to ${previousVersion}`,
        resourceType: "deployment",
        resourceId: deployment._id.toString(),
      });

      res.json({
        success: true,
        deployment: await Deployment.findById(deployment._id),
        logs,
      });
    } else {
      logs.push(`[${new Date().toISOString()}] Rollback failed: ${runResult.error}`);

      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "failed",
        endTime: new Date(),
        duration: Date.now() - deployment.startTime,
        logs,
      });

      await createAlert(userId, {
        type: "deployment_failed",
        severity: "critical",
        title: `Rollback Failed: ${previousVersion}`,
        message: `Rollback to ${previousVersion} failed: ${runResult.error}`,
        resourceType: "deployment",
        resourceId: deployment._id.toString(),
      });

      res.status(500).json({
        success: false,
        error: runResult.error,
        logs,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments
 * Get deployment history
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;
    const status = req.query.status;

    const query = { userId };
    if (status) query.status = status;

    const deployments = await Deployment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Deployment.countDocuments(query);

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
 * GET /api/deployments/stats
 * Get deployment statistics
 */
router.get("/stats", async (req, res, next) => {
  try {
    const userId = getUserId(req);

    // Overall stats
    const totalDeployments = await Deployment.countDocuments({ userId });
    const successDeployments = await Deployment.countDocuments({ userId, status: "success" });
    const failedDeployments = await Deployment.countDocuments({ userId, status: "failed" });
    const autoDeployments = await Deployment.countDocuments({ userId, deploymentType: "auto" });
    const manualDeployments = await Deployment.countDocuments({ userId, deploymentType: "manual" });
    const rollbackDeployments = await Deployment.countDocuments({ userId, deploymentType: "rollback" });

    // Success rate
    const successRate = totalDeployments > 0 ? (successDeployments / totalDeployments) * 100 : 0;

    // Average deployment time
    const deployments = await Deployment.find({ userId, status: "success" }).lean();
    const avgDuration = deployments.length > 0
      ? deployments.reduce((sum, d) => sum + (d.duration || 0), 0) / deployments.length
      : 0;

    // By environment
    const byEnvironment = await Deployment.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: "$environment",
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] },
          },
        },
      },
    ]);

    // Recent deployments
    const recent = await Deployment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      stats: {
        total: totalDeployments,
        success: successDeployments,
        failed: failedDeployments,
        successRate: Math.round(successRate * 100) / 100,
        byType: {
          auto: autoDeployments,
          manual: manualDeployments,
          rollback: rollbackDeployments,
        },
        avgDuration: Math.round(avgDuration / 1000), // Convert to seconds
        byEnvironment: byEnvironment || [],
        recentDeployments: recent,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/auto
 * Get automatic deployments only
 */
router.get("/auto", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;
    const status = req.query.status;

    const query = { userId, deploymentType: "auto" };
    if (status) query.status = status;

    const deployments = await Deployment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Deployment.countDocuments(query);

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
 * GET /api/deployments/:id
 * Get deployment details
 */
router.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const deployment = await Deployment.findOne({
      _id: req.params.id,
      userId,
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment not found",
      });
    }

    res.json({
      success: true,
      deployment,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
