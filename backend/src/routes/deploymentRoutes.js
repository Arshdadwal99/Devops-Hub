import express from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { deployContainer, stopContainer, getContainers, runContainer, getContainerLogs, restartContainer, getDockerConnectionConfig, getDockerStatus } from "../services/dockerService.js";
import { Deployment } from "../models/Deployment.js";
import { Build } from "../models/Build.js";
import { Image } from "../models/Image.js";
import { Log } from "../models/Logs.js";
import { Alert } from "../models/Alert.js";
import { createAlert } from "../services/alertService.js";
import { deployGitHubRepository } from "../services/githubPipelineService.js";
import { prepareDeploymentWorkspace } from "../services/deploymentWorkspaceService.js";
import { buildDockerImage } from "../services/dockerBuildService.js";
import { pushImageToDockerHub, getImageHistory, getImageDetails, getImagesByBuild } from "../services/dockerHubPushService.js";
import { getDockerHubStatus } from "../services/dockerHubRegistryService.js";
import { getJenkinsStatus, jenkinsValidationPassed } from "../services/jenkinsConnectionService.js";
import {
  disableAutoDeploy,
  enableAutoDeploy,
  getAutoDeployLogs,
  getAutoDeployStatus,
} from "../services/autoDeployService.js";
import {
  automatedOneClickSetup,
  getAutomatedSetupStatus,
  retryAutomatedSetup,
} from "../services/automatedSetupService.js";
import {
  buildSetupStepsFromSetup,
  getNextPrimaryActionFromSetup,
  getPrimaryStageFromSetup,
  recalculateDeploymentWorkflowState,
} from "../services/workflowStateService.js";
import {
  validateIntegrations,
  startDeployment,
  getDeploymentProgress,
  getDeploymentDetails as getDeploymentDetailsService,
} from "../services/workflowOrchestrationService.js";
import { checkDeployedApplicationHealth, getDeploymentHealthStatus } from "../services/healthCheckService.js";

const router = express.Router();
const execFileAsync = promisify(execFile);

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

const DEPLOYMENT_STAGES = ["PREPARED", "IMAGE_BUILT", "TESTED", "PUSHED_TO_REGISTRY", "DEPLOYED"];
const INTERNAL_PIPELINE_STEPS = [
  "GitHub Push",
  "GitHub Webhook",
  "Jenkins Job Trigger",
  "Build Docker Image",
  "Run Tests",
  "Push Docker Image",
  "Deploy EC2",
  "Health Check",
];

function getHighestStage(...stages) {
  return stages
    .filter(Boolean)
    .reduce((highest, stage) => {
      return DEPLOYMENT_STAGES.indexOf(stage) > DEPLOYMENT_STAGES.indexOf(highest) ? stage : highest;
    }, "PREPARED");
}

function buildSetupSteps(deployment) {
  return buildSetupStepsFromSetup(deployment.setup || {});
}

function getPrimaryStage(deployment) {
  return getPrimaryStageFromSetup(deployment.setup || {});
}

function getNextPrimaryAction(deployment) {
  return getNextPrimaryActionFromSetup(deployment.setup || {});
}

function buildImageTagForDeployment(deployment) {
  const repository = String(deployment?.repository || "app")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "app";
  const tag = String(deployment?.commitSha?.slice(0, 12) || deployment?.deploymentId || "latest")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "latest";

  return `devopshub/${repository}:${tag}`;
}

async function getDeploymentWorkflow({ userId, deploymentId }) {
  let deployment = await Deployment.findOne({ deploymentId, userId }).lean();

  if (!deployment) {
    return null;
  }

  const workflowState = await recalculateDeploymentWorkflowState({
    userId,
    deploymentId,
    deployment,
    persist: true,
  });
  deployment = workflowState?.deployment || deployment;

  const projectId = deployment.projectId || `${deployment.owner}/${deployment.repository}`;
  const expectedImageTag = buildImageTagForDeployment(deployment);
  const search = [
    { deploymentId },
    { imageTag: expectedImageTag },
  ];

  if (projectId && deployment.commitSha) {
    search.push({ projectId, commitSha: deployment.commitSha });
  }

  const builds = await Build.find({
    userId,
    $or: search,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const successfulBuild = builds.find((build) => build.status === "SUCCESS" || build.buildStatus === "SUCCESS");
  const failedBuild = builds.find((build) => build.status === "FAILED" || build.buildStatus === "FAILED");
  const latestBuildFailed = builds[0]?.status === "FAILED" || builds[0]?.buildStatus === "FAILED";
  const images = successfulBuild
    ? await Image.find({ userId, buildId: successfulBuild.buildId }).sort({ createdAt: -1 }).lean()
    : [];
  const pushedImage = images.find((image) => image.status === "SUCCESS");
  const inferredStage = getHighestStage(
    deployment.deploymentStage,
    successfulBuild ? "IMAGE_BUILT" : null,
    deployment.testedAt ? "TESTED" : null,
    pushedImage ? "PUSHED_TO_REGISTRY" : null,
    deployment.status === "success" ? "DEPLOYED" : null
  );

  if (inferredStage !== deployment.deploymentStage || successfulBuild?.buildId !== deployment.currentBuildId) {
    await Deployment.updateOne(
      { deploymentId, userId },
      {
        deploymentStage: inferredStage,
        currentBuildId: successfulBuild?.buildId || deployment.currentBuildId,
        currentImageTag: successfulBuild?.imageTag || deployment.currentImageTag,
        currentImageId: successfulBuild?.imageId || deployment.currentImageId,
        updatedAt: new Date(),
      }
    );
  }

  return {
    success: true,
    deployment: {
      ...deployment,
      deploymentStage: inferredStage,
      currentBuildId: successfulBuild?.buildId || deployment.currentBuildId,
      currentImageTag: successfulBuild?.imageTag || deployment.currentImageTag,
      currentImageId: successfulBuild?.imageId || deployment.currentImageId,
    },
    stage: getPrimaryStage(deployment),
    internalStage: inferredStage,
    setup: deployment.setup || {},
    setupSteps: workflowState?.setupSteps || buildSetupSteps(deployment),
    pipelineSteps: INTERNAL_PIPELINE_STEPS.map((label, index) => ({
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      label,
      status: deployment.setup?.autoDeployEnabled ? "waiting_for_push" : "configured_after_enable",
      order: index + 1,
    })),
    projectId,
    commitSha: deployment.commitSha,
    expectedImageTag,
    imageAvailable: Boolean(successfulBuild),
    hasFailedBuild: Boolean(latestBuildFailed || (failedBuild && !successfulBuild)),
    build: successfulBuild || builds[0] || null,
    pushedImage: pushedImage || null,
    buildHistory: builds,
    currentStep: getPrimaryStage(deployment),
    resources: workflowState?.resources,
    nextActions: getNextPrimaryAction(deployment) ? [getNextPrimaryAction(deployment)] : [],
  };
}

async function verifyLocalImage(imageTag) {
  const dockerStatus = await getDockerStatus({ force: true });
  if (!dockerStatus.available) {
    throw new Error(dockerStatus.error || "Docker daemon unavailable. Start Docker before testing an image.");
  }

  const connection = getDockerConnectionConfig();
  await execFileAsync("docker", ["image", "inspect", imageTag], {
    env: connection.env,
    maxBuffer: 5 * 1024 * 1024,
  });
}

/**
 * POST /api/deployments/prepare
 * Clone and validate a repository in a temporary workspace before build/deploy.
 */
router.post("/prepare", async (req, res, next) => {
  try {
    const { repositoryOwner, repositoryName, branch = "main", repositoryId } = req.body || {};

    if (!repositoryOwner || typeof repositoryOwner !== "string") {
      return res.status(400).json({
        success: false,
        error: "repositoryOwner is required",
      });
    }

    if (!repositoryName || typeof repositoryName !== "string") {
      return res.status(400).json({
        success: false,
        error: "repositoryName is required",
      });
    }

    const result = await prepareDeploymentWorkspace({
      user: req.user,
      repositoryOwner: repositoryOwner.trim(),
      repositoryName: repositoryName.trim(),
      branch: typeof branch === "string" && branch.trim() ? branch.trim() : "main",
      repositoryId,
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
 * POST /api/deployments/build
 * Build a Docker image from a prepared deployment workspace.
 */
router.post("/build", async (req, res, next) => {
  try {
    const { deploymentId, forceRebuild = false } = req.body || {};

    if (!deploymentId || typeof deploymentId !== "string") {
      return res.status(400).json({
        success: false,
        error: "deploymentId is required",
      });
    }

    const result = await buildDockerImage({
      user: req.user,
      deploymentId: deploymentId.trim(),
      forceRebuild: Boolean(forceRebuild),
    });

    res.json(result);
  } catch (error) {
    if (error.message?.includes("Docker daemon unavailable") || error.message?.includes("Docker Desktop daemon unavailable")) {
      return res.status(503).json({
        success: false,
        error: error.message,
      });
    }

    next(error);
  }
});

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
      deploymentId,
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

    const deploymentPayload = {
      userId,
      ...(deploymentId && { deploymentId }),
      version,
      status: "in-progress",
      deploymentStage: "PUSHED_TO_REGISTRY",
      deploymentType: "manual",
      deployedBy: req.user?.email || "api-user",
      startTime: new Date(),
      containers: [{ name: containerName, image, status: "pending" }],
    };

    const deployment = deploymentId
      ? await Deployment.findOneAndUpdate(
          { userId, deploymentId },
          {
            ...deploymentPayload,
            updatedAt: new Date(),
            $push: { logs: `Deploying image ${image}` },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
      : await Deployment.create(deploymentPayload);

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
        deploymentStage: "DEPLOYED",
        currentImageTag: image,
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
 * GET /api/deployments/builds/history
 * Get Docker build history.
 */
router.get("/builds/history", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit) || 20;

    const builds = await Build.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      builds,
      count: builds.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/builds/workflow/:deploymentId
 * Resolve deployment stage and reusable image/build metadata.
 */
router.get("/builds/workflow/:deploymentId", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const workflow = await getDeploymentWorkflow({
      userId,
      deploymentId: req.params.deploymentId,
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: "Deployment workspace not found",
      });
    }

    res.json(workflow);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/builds/:deploymentId
 * Get latest Docker build for a deployment.
 */
router.get("/builds/:deploymentId", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const build = await Build.findOne({
      userId,
      deploymentId: req.params.deploymentId,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!build) {
      return res.status(404).json({
        success: false,
        error: "Build not found",
      });
    }

    res.json({
      success: true,
      build,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/auto-deploy/status
 * Get Jenkins-based auto deploy configuration, latest deployment, and preconditions.
 */
router.get("/auto-deploy/status", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await getAutoDeployStatus(userId, {
      owner: req.query.owner,
      repo: req.query.repo,
      branch: req.query.branch,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/auto-deploy/logs
 * Get auto deploy and latest deployment logs.
 */
router.get("/auto-deploy/logs", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await getAutoDeployLogs(userId, {
      owner: req.query.owner,
      repo: req.query.repo,
      branch: req.query.branch,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/auto-deploy/enable
 * Enable Jenkins job GitHub push trigger after all preconditions pass.
 */
router.post("/auto-deploy/enable", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await enableAutoDeploy(userId, req.body || {});

    if (!result.success) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/auto-deploy/disable
 * Disable Jenkins job GitHub push trigger.
 */
router.post("/auto-deploy/disable", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const result = await disableAutoDeploy(userId, req.body || {});

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deployments/setup/:deploymentId
 * Advance the primary CI/CD setup workflow. Build, test, push, and deploy remain
 * internal GitHub Actions pipeline steps after auto deploy is enabled.
 */
router.post("/setup/:deploymentId", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { action, dockerHubUsername } = req.body || {};

    const actionMap = {
      generate_deployment_files: {
        field: "deploymentFilesGenerated",
        stage: "DEPLOYMENT_FILES_GENERATED",
        log: "Deployment files generated for CI/CD pipeline",
      },
      connect_docker_hub: {
        field: "dockerHubConnected",
        stage: "DOCKER_HUB_CONNECTED",
        log: "Docker Hub registry connected for pipeline pushes",
      },
      connect_jenkins: {
        field: "jenkinsConnected",
        stage: "JENKINS_CONNECTED",
        log: "Jenkins connected for pipeline orchestration",
      },
      generate_cicd_pipeline: {
        field: "cicdGenerated",
        stage: "CICD_GENERATED",
        log: "GitHub Actions CI/CD pipeline generated",
      },
      enable_auto_deploy: {
        field: "autoDeployEnabled",
        stage: "AUTO_DEPLOY_ENABLED",
        log: "Auto deploy enabled; future GitHub pushes trigger the pipeline",
      },
    };

    const setupAction = actionMap[action];
    if (!setupAction) {
      return res.status(400).json({
        success: false,
        error: "Unsupported setup action",
      });
    }

    let dockerHubStatus = null;
    if (action === "connect_docker_hub" || action === "enable_auto_deploy") {
      const registry = await getDockerHubStatus(userId);
      dockerHubStatus = registry.status;

      if (!dockerHubStatus?.connected || !dockerHubStatus?.permissions?.login || !dockerHubStatus?.permissions?.push) {
        return res.status(409).json({
          success: false,
          error: "Docker Hub must be connected with login and push permissions before continuing.",
        });
      }
    }

    let existingDeployment = await Deployment.findOne({
      userId,
      deploymentId: req.params.deploymentId,
    }).lean();

    if (!existingDeployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment workspace not found",
      });
    }

    const workflowState = await recalculateDeploymentWorkflowState({
      userId,
      deploymentId: req.params.deploymentId,
      deployment: existingDeployment,
      persist: true,
    });
    existingDeployment = workflowState?.deployment || existingDeployment;

    if (action === "enable_auto_deploy") {
      const result = await enableAutoDeploy(userId, {
        deploymentId: existingDeployment.deploymentId,
        owner: existingDeployment.owner,
        repo: existingDeployment.repository,
        branch: existingDeployment.branch,
      });

      if (!result.success) {
        return res.status(409).json(result);
      }

      const refreshedState = await recalculateDeploymentWorkflowState({
        userId,
        deploymentId: req.params.deploymentId,
        persist: true,
      });
      const refreshed = refreshedState?.deployment || await Deployment.findOne({
        userId,
        deploymentId: req.params.deploymentId,
      }).lean();

      return res.json({
        success: true,
        deployment: refreshed || existingDeployment,
        stage: refreshed ? getPrimaryStage(refreshed) : "AUTO_DEPLOY_ENABLED",
        setup: refreshed?.setup || existingDeployment.setup || {},
        setupSteps: refreshedState?.setupSteps || buildSetupSteps(refreshed || existingDeployment),
        pipelineSteps: INTERNAL_PIPELINE_STEPS,
        debug: refreshedState?.debug,
        resources: refreshedState?.resources,
        autoDeploy: result.autoDeploy,
      });
    }

    if (action === "enable_auto_deploy") {
      const { AWSConnection } = await import("../models/AWSConnection.js");
      const awsConnection = await AWSConnection.findOne({ userId, connected: true }).lean();
      if (!awsConnection) {
        return res.status(409).json({
          success: false,
          error: "AWS Account must be connected. EC2 infrastructure will be automatically provisioned.",
        });
      }
    }

    if (action === "connect_jenkins" || action === "generate_cicd_pipeline" || action === "enable_auto_deploy") {
      const jenkins = await getJenkinsStatus(userId);
      if (!existingDeployment.setup?.jenkinsConnected && !jenkinsValidationPassed(jenkins.status)) {
        return res.status(409).json({
          success: false,
          error: "Jenkins must be connected and pass reachability, authentication, job, and node permission validation before continuing.",
        });
      }
    }

    if (action === "enable_auto_deploy" && !existingDeployment.setup?.dockerHubConnected) {
      return res.status(409).json({
        success: false,
        error: "Docker Hub Connected must be completed before Auto Deploy setup.",
      });
    }

    if (action === "enable_auto_deploy" && !existingDeployment.setup?.ec2Connected) {
      return res.status(409).json({
        success: false,
        error: "EC2 Connected must be completed before Auto Deploy setup.",
      });
    }

    if (action === "generate_cicd_pipeline" && !existingDeployment.setup?.jenkinsConnected) {
      return res.status(409).json({
        success: false,
        error: "Jenkins Connected must be completed before CI/CD pipeline generation.",
      });
    }

    if (action === "enable_auto_deploy" && !existingDeployment.setup?.jenkinsConnected) {
      return res.status(409).json({
        success: false,
        error: "Jenkins Connected must be completed before Auto Deploy setup.",
      });
    }

    const update = {
      deploymentStage: setupAction.stage,
      [`setup.${setupAction.field}`]: true,
      "setup.updatedAt": new Date(),
      updatedAt: new Date(),
      $push: { logs: setupAction.log },
    };

    if (action === "connect_docker_hub") {
      update["setup.dockerHubUsername"] = dockerHubStatus?.username || dockerHubUsername || "configured";
    }

    if (action === "connect_jenkins") {
      const jenkins = await getJenkinsStatus(userId);
      update["setup.jenkinsUrl"] = jenkins.status?.url || "configured";
      update["setup.jenkinsUser"] = jenkins.status?.connectedUser || jenkins.status?.username || "configured";
    }

    if (action === "enable_auto_deploy") {
      update["setup.autoDeployEnabledAt"] = new Date();
      update.status = "success";
      update.deploymentType = "auto";
      update.$push = {
        logs: {
          $each: [
            setupAction.log,
            ...INTERNAL_PIPELINE_STEPS.map((step) => `Pipeline step registered: ${step}`),
          ],
        },
      };
    }

    const deployment = await Deployment.findOneAndUpdate(
      { userId, deploymentId: req.params.deploymentId },
      update,
      { new: true }
    ).lean();

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment workspace not found",
      });
    }

    const refreshedState = await recalculateDeploymentWorkflowState({
      userId,
      deploymentId: req.params.deploymentId,
      deployment,
      persist: true,
    });
    const refreshedDeployment = refreshedState?.deployment || deployment;

    res.json({
      success: true,
      deployment: refreshedDeployment,
      stage: getPrimaryStage(refreshedDeployment),
      setup: refreshedDeployment.setup || {},
      setupSteps: refreshedState?.setupSteps || buildSetupSteps(refreshedDeployment),
      pipelineSteps: INTERNAL_PIPELINE_STEPS,
      debug: refreshedState?.debug,
      resources: refreshedState?.resources,
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

/**
 * POST /api/deployments/push
 * Push a built Docker image to Docker Hub
 */
router.post("/push", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { buildId, dockerHubUsername, dockerHubPassword, dockerHubRepo } = req.body || {};

    if (!buildId) {
      return res.status(400).json({
        success: false,
        error: "buildId is required",
      });
    }

    if (!dockerHubUsername) {
      return res.status(400).json({
        success: false,
        error: "dockerHubUsername is required",
      });
    }

    if (!dockerHubPassword) {
      return res.status(400).json({
        success: false,
        error: "dockerHubPassword is required",
      });
    }

    if (!dockerHubRepo) {
      return res.status(400).json({
        success: false,
        error: "dockerHubRepo is required (e.g., 'my-app')",
      });
    }

    console.log(`🚀 [Deployment] Starting push to Docker Hub: ${buildId}`);

    const result = await pushImageToDockerHub({
      user: req.user,
      buildId: buildId.trim(),
      dockerHubUsername: dockerHubUsername.trim(),
      dockerHubPassword: dockerHubPassword.trim(),
      dockerHubRepo: dockerHubRepo.trim(),
    });

    if (result.success) {
      // Create success alert
      await createAlert(userId, {
        type: "docker_push_started",
        severity: "info",
        title: `Docker Push Started: ${buildId}`,
        message: `Pushing image to Docker Hub: ${result.targetImageTag}`,
        resourceType: "image",
        resourceId: result.imageId,
        metadata: { imageId: result.imageId, buildId },
      });

      console.log(`✅ [Deployment] Push started: ${buildId}`);

      res.json(result);
    } else {
      // Create failure alert
      await createAlert(userId, {
        type: "docker_push_failed",
        severity: "critical",
        title: `Docker Push Failed: ${buildId}`,
        message: `Failed to push image: ${result.error}`,
        resourceType: "image",
        resourceId: result.imageId,
        metadata: { imageId: result.imageId, buildId, error: result.error },
      });

      console.log(`❌ [Deployment] Push failed: ${buildId}`);

      res.status(500).json(result);
    }
  } catch (error) {
    if (error.message?.includes("Docker daemon unavailable") || error.message?.includes("Docker Desktop daemon unavailable")) {
      return res.status(503).json({
        success: false,
        error: error.message,
      });
    }

    next(error);
  }
});

/**
 * POST /api/deployments/test-container
 * Mark a successfully built image as tested after confirming build metadata exists.
 */
router.post("/test-container", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { deploymentId, buildId } = req.body || {};

    if (!deploymentId && !buildId) {
      return res.status(400).json({
        success: false,
        error: "deploymentId or buildId is required",
      });
    }

    const build = await Build.findOne({
      userId,
      status: "SUCCESS",
      ...(buildId ? { buildId } : { deploymentId }),
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!build) {
      return res.status(404).json({
        success: false,
        error: "A successful Docker image build is required before testing",
      });
    }

    await verifyLocalImage(build.imageTag);

    const updatedDeployment = await Deployment.findOneAndUpdate(
      { userId, deploymentId: build.deploymentId },
      {
        deploymentStage: "TESTED",
        currentBuildId: build.buildId,
        currentImageTag: build.imageTag,
        currentImageId: build.imageId,
        testedAt: new Date(),
        updatedAt: new Date(),
        $push: { logs: `Container test completed for ${build.imageTag}` },
      },
      { new: true }
    ).lean();

    res.json({
      success: true,
      stage: "TESTED",
      build,
      deployment: updatedDeployment,
      message: "Container test completed",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/images/history
 * Get image push history for current user
 */
router.get("/images/history", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const result = await getImageHistory(userId, limit);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/images/:imageId
 * Get details for a specific image
 */
router.get("/images/:imageId", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { imageId } = req.params;

    const result = await getImageDetails(imageId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    // Verify ownership
    if (result.image.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deployments/builds/:buildId/images
 * Get all images pushed from a specific build
 */
router.get("/builds/:buildId/images", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { buildId } = req.params;

    // Verify build ownership
    const build = await Build.findOne({ buildId, userId });
    if (!build) {
      return res.status(404).json({
        success: false,
        error: "Build not found",
      });
    }

    const result = await getImagesByBuild(buildId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

async function validateOneClickDeployment(req, res) {
  try {
    const userId = getUserId(req);
    const { repositoryUrl } = req.body || {};

    console.log(`🔍 [One-Click Validate] Starting validation for user ${userId}`);
    console.log(`📦 Request body:`, { repositoryUrl, ...req.body });

    if (!repositoryUrl) {
      console.warn(`⚠️  [One-Click Validate] Missing repositoryUrl`);
      return res.status(400).json({
        success: false,
        error: "repositoryUrl is required",
      });
    }

    console.log(`🔄 [One-Click Validate] Calling validateIntegrations...`);
    const result = await validateIntegrations(userId, req.body || {});
    console.log(`✅ [One-Click Validate] Validation complete:`, {
      success: result.success,
      missingCount: result.missingIntegrations?.length || 0,
    });
    res.json(result);
  } catch (error) {
    console.error("❌ [One-Click Validate] Error:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      error: error.message || "Validation failed",
    });
  }
}

async function startOneClickDeployment(req, res) {
  try {
    const userId = getUserId(req);
    const { repositoryUrl, repositoryName, branch = "main", environment = "production" } = req.body || {};

    console.log(`🚀 [One-Click Deploy] Starting deployment for user ${userId}`);
    console.log(`📦 Request:`, { repositoryUrl, repositoryName, branch, environment });

    if (!repositoryUrl || !repositoryName) {
      console.warn(`⚠️  [One-Click Deploy] Missing required parameters`);
      return res.status(400).json({
        success: false,
        error: "repositoryUrl and repositoryName are required",
      });
    }

    console.log(`🔄 [One-Click Deploy] Calling startDeployment service...`);
    const result = await startDeployment(userId, {
      repositoryUrl,
      repositoryName,
      branch,
      environment,
    });

    console.log(`✅ [One-Click Deploy] Deployment started:`, {
      deploymentId: result.deploymentId,
      success: result.success,
    });
    res.json(result);
  } catch (error) {
    console.error("❌ [One-Click Deploy] Error:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      failedStep: error.failedStep || "Deployment Start",
      error: error.message || "Deployment start failed before a deployment record was created",
      stack: error.stack,
    });
  }
}

async function getOneClickDeploymentProgress(req, res) {
  try {
    const deploymentId = req.params.deploymentId || req.params.id;
    console.log(`📊 [One-Click Progress] Fetching progress for deployment: ${deploymentId}`);

    if (!deploymentId) {
      console.warn(`⚠️  [One-Click Progress] Missing deploymentId`);
      return res.status(400).json({
        success: false,
        error: "deploymentId is required",
      });
    }

    const result = await getDeploymentProgress(deploymentId);
    console.log(`✅ [One-Click Progress] Retrieved:`, {
      deploymentId,
      phase: result.phase,
      overall: result.overall,
    });
    res.json(result);
  } catch (error) {
    console.error(`❌ [One-Click Progress] Error for deployment ${req.params.deploymentId || req.params.id}:`, error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get progress",
    });
  }
}

async function detailedValidateOneClickDeployment(req, res) {
  try {
    const userId = getUserId(req);
    const { repositoryUrl } = req.body || {};

    console.log("[DEPLOYMENT] Validation started", { userId, repositoryUrl });

    if (!repositoryUrl) {
      console.warn("[DEPLOYMENT] Validation failed", { error: "repositoryUrl is required" });
      return res.status(400).json({
        success: false,
        failedStep: "Validation",
        error: "repositoryUrl is required",
      });
    }

    const result = await validateIntegrations(userId, req.body || {});
    console.log("[DEPLOYMENT] Validation completed", {
      success: result.success,
      missingCount: result.missingIntegrations?.length || 0,
    });
    res.json(result);
  } catch (error) {
    console.error("[DEPLOYMENT] Validation failed", { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      failedStep: "Validation",
      error: error.message || "Validation failed",
      stack: error.stack,
    });
  }
}

async function detailedStartOneClickDeployment(req, res) {
  try {
    const userId = getUserId(req);
    const { repositoryUrl, repositoryName, branch = "main", environment = "production" } = req.body || {};

    console.log("[DEPLOYMENT] Deployment start requested", { userId, repositoryUrl, repositoryName, branch, environment });

    if (!repositoryUrl || !repositoryName) {
      console.warn("[DEPLOYMENT] Validation failed", { error: "repositoryUrl and repositoryName are required" });
      return res.status(400).json({
        success: false,
        failedStep: "Validation",
        error: "repositoryUrl and repositoryName are required",
      });
    }

    const result = await startDeployment(userId, {
      repositoryUrl,
      repositoryName,
      branch,
      environment,
      owner: req.body?.owner,
      repo: req.body?.repo,
    });

    console.log("[DEPLOYMENT] Deployment start completed", {
      deploymentId: result.deploymentId,
      success: result.success,
      failedStep: result.failedStep,
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("[DEPLOYMENT] Deployment start failed", { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      failedStep: error.failedStep || "Deployment Start",
      error: error.message || "Deployment start failed",
      stack: error.stack,
    });
  }
}

async function detailedGetOneClickDeploymentProgress(req, res) {
  try {
    const deploymentId = req.params.deploymentId || req.params.id;
    console.log("[DEPLOYMENT] Progress lookup started", { deploymentId });

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        failedStep: "Progress Lookup",
        error: "deploymentId is required",
      });
    }

    const result = await getDeploymentProgress(deploymentId);
    console.log("[DEPLOYMENT] Progress lookup completed", {
      deploymentId,
      currentStep: result.currentStep,
      failedStep: result.failedStep,
      overallProgress: result.overallProgress,
      status: result.status,
    });
    res.json(result);
  } catch (error) {
    console.error("[DEPLOYMENT] Progress lookup failed", { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      failedStep: "Progress Lookup",
      error: error.message || "Failed to get progress",
      stack: error.stack,
    });
  }
}

/**
 * POST /api/deployment/one-click-validate
 * Validate all integrations before one-click deployment.
 */
router.post("/one-click-validate", detailedValidateOneClickDeployment);

/**
 * POST /api/deployment/one-click-deploy
 * Start one-click deployment workflow.
 */
router.post("/one-click-deploy", detailedStartOneClickDeployment);

/**
 * POST /api/deployment/start
 * Alias used by CI/CD deployment clients.
 */
router.post("/start", detailedStartOneClickDeployment);

/**
 * GET /api/deployment/:deploymentId/progress
 * Get deployment progress for the one-click modal.
 */
router.get("/:deploymentId/progress", detailedGetOneClickDeploymentProgress);

/**
 * GET /api/deployment/:deploymentId/health
 * Check health status of a deployment
 */
router.get("/:deploymentId/health", async (req, res, next) => {
  try {
    const { deploymentId } = req.params;

    const deployment = await Deployment.findById(deploymentId).lean();
    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: "Deployment not found",
      });
    }

    const healthStatus = await getDeploymentHealthStatus(deployment);
    
    // Update deployment with latest health status
    await Deployment.findByIdAndUpdate(
      deploymentId,
      {
        "deploymentEndpoint.healthStatus": healthStatus.status,
        "deploymentEndpoint.isLive": healthStatus.isLive,
        "deploymentEndpoint.lastHealthCheck": new Date(),
        "deploymentEndpoint.healthCheckStatus": healthStatus.httpStatus ? `HTTP ${healthStatus.httpStatus}` : healthStatus.message,
      }
    );

    res.json({
      success: true,
      deploymentId,
      ...healthStatus,
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to check deployment health",
    });
  }
});

/**
 * GET /api/deployment/status/:id
 * Alias used by CI/CD deployment clients.
 */
router.get("/status/:id", detailedGetOneClickDeploymentProgress);

/**
 * GET /api/deployment/:deploymentId
 * Get full deployment details
 */
router.get("/:deploymentId", async (req, res, next) => {
  try {
    const { deploymentId } = req.params;

    const result = await getDeploymentDetailsService(deploymentId);
    res.json(result);
  } catch (error) {
    console.error("Get deployment details error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get deployment details",
    });
  }
});

/**
 * POST /api/deployment/:deploymentId/auto-deploy/enable
 * Enable auto-deploy for a deployment
 */
router.post("/:deploymentId/auto-deploy/enable", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { deploymentId } = req.params;

    const deployment = await Deployment.findByIdAndUpdate(
      deploymentId,
      {
        autoDeployEnabled: true,
        updatedAt: new Date(),
      },
      { new: true }
    );

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
    console.error("Enable auto-deploy error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to enable auto-deploy",
    });
  }
});

/**
 * POST /api/deployment/:deploymentId/auto-deploy/disable
 * Disable auto-deploy for a deployment
 */
router.post("/:deploymentId/auto-deploy/disable", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { deploymentId } = req.params;

    const deployment = await Deployment.findByIdAndUpdate(
      deploymentId,
      {
        autoDeployEnabled: false,
        updatedAt: new Date(),
      },
      { new: true }
    );

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
    console.error("Disable auto-deploy error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to disable auto-deploy",
    });
  }
});

/**
 * POST /api/deployments/oneclick
 * One-Click CI/CD Deployment
 */
router.post("/oneclick", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { owner, repo, branch = "main" } = req.body || {};

    if (!owner || typeof owner !== "string") {
      return res.status(400).json({
        success: false,
        error: "owner is required",
      });
    }

    if (!repo || typeof repo !== "string") {
      return res.status(400).json({
        success: false,
        error: "repo is required",
      });
    }

    const deploymentConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      branch: typeof branch === "string" ? branch.trim() : "main",
    };

    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      deploymentId,
      message: "One-click deployment started",
    });

    oneClickDeploymentService.executeOneClickDeployment(userId, deploymentConfig).catch((error) => {
      console.error("[OneClick Deploy] Error:", error);
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || "One-click deployment failed",
    });
  }
});

/**
 * GET /api/deployments/oneclick/:deploymentId
 */
router.get("/oneclick/:deploymentId", async (req, res, next) => {
  try {
    const { deploymentId } = req.params;

    const deployment = await oneClickDeploymentService.getDeploymentStatus(deploymentId);

    res.json({
      success: true,
      deployment,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/deployments/user/deployments
 */
router.get("/user/deployments", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const deployments = await oneClickDeploymentService.getUserDeployments(userId);

    res.json({
      success: true,
      deployments,
      count: deployments.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Catch-all for debugging unmapped routes
 */
router.use((_req, res) => {
  console.warn(`⚠️  [Deployment Routes] Unhandled request: ${_req.method} ${_req.path}`);
  res.status(404).json({
    success: false,
    error: "Deployment endpoint not found",
    path: _req.path,
    method: _req.method,
    availableEndpoints: [
      "POST /one-click-validate",
      "POST /one-click-deploy", 
      "POST /start",
      "GET /status/:id",
      "GET /:deploymentId/progress",
      "GET /:deploymentId",
      "GET /health",
    ],
  });
});

export default router;
