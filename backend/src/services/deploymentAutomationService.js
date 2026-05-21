import { exec } from "child_process";
import { promisify } from "util";
import axios from "axios";
import { Deployment } from "../models/Deployment.js";
import { Webhook } from "../models/Webhook.js";
import { BuildHistory } from "../models/BuildHistory.js";
import {
  buildImage,
  deployContainer,
  getContainers,
  stopContainer,
  removeContainer,
  pruneUnusedImages,
} from "./dockerService.js";
import { createAlert } from "./alertService.js";
import { Log } from "../models/Logs.js";
import {
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
  emitNewLog,
} from "./socketEventsService.js";

const execAsync = promisify(exec);

/**
 * Configuration for deployment automation
 */
const DEPLOYMENT_CONFIG = {
  JENKINS_URL: process.env.JENKINS_URL || "http://localhost:8080",
  JENKINS_USERNAME: process.env.JENKINS_USER || process.env.JENKINS_USERNAME || "admin",
  JENKINS_TOKEN: process.env.JENKINS_TOKEN,
  DOCKER_REGISTRY: process.env.DOCKER_REGISTRY || "localhost",
  DOCKER_REGISTRY_USERNAME: process.env.DOCKER_REGISTRY_USERNAME,
  DOCKER_REGISTRY_PASSWORD: process.env.DOCKER_REGISTRY_PASSWORD,
  CONTAINER_PORT: process.env.CONTAINER_PORT || "3000",
  HOST_PORT: process.env.HOST_PORT || "3000",
  DEPLOYMENT_TIMEOUT: parseInt(process.env.DEPLOYMENT_TIMEOUT) || 300000, // 5 minutes
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 5000, // 5 seconds
};

/**
 * Wait for Jenkins build to complete
 */
export const waitForJenkinsBuild = async (buildNumber, jobName, maxWaitTime = DEPLOYMENT_CONFIG.DEPLOYMENT_TIMEOUT) => {
  try {
    console.log(`⏳ [Deployment] Waiting for Jenkins build #${buildNumber} to complete...`);

    const startTime = Date.now();
    const auth = Buffer.from(
      `${DEPLOYMENT_CONFIG.JENKINS_USERNAME}:${DEPLOYMENT_CONFIG.JENKINS_TOKEN}`
    ).toString("base64");

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `${DEPLOYMENT_CONFIG.JENKINS_URL}/job/${jobName}/${buildNumber}/api/json`,
          {
            headers: { Authorization: `Basic ${auth}` },
            timeout: 10000,
          }
        );

        const build = response.data;

        if (build.result) {
          // Build is complete
          console.log(`✅ Jenkins build #${buildNumber} completed with result: ${build.result}`);

          return {
            success: true,
            buildNumber,
            result: build.result,
            duration: build.duration,
            timestamp: build.startTime,
            url: build.url,
            isSuccess: build.result === "SUCCESS",
            artifacts: build.artifacts || [],
            parameters: build.actions
              ?.find(a => a._class?.includes("ParametersAction"))
              ?.parameters || [],
          };
        }

        console.log(`⏳ Build #${buildNumber} still running... (${Math.round((Date.now() - startTime) / 1000)}s)`);
        await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_CONFIG.POLL_INTERVAL));
      } catch (error) {
        if (error.response?.status === 404) {
          console.warn(`⚠️  Build #${buildNumber} not found`);
          return {
            success: false,
            error: `Build #${buildNumber} not found`,
          };
        }
        throw error;
      }
    }

    console.error(`❌ Build #${buildNumber} did not complete within ${maxWaitTime}ms`);
    return {
      success: false,
      error: `Build did not complete within ${maxWaitTime}ms`,
    };
  } catch (error) {
    console.error("❌ Error waiting for Jenkins build:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Build Docker image from Jenkins build
 */
export const buildDockerImage = async (
  jobName,
  buildNumber,
  imageTag,
  dockerfilePath = "./Dockerfile"
) => {
  try {
    console.log(`🔨 [Deployment] Building Docker image: ${imageTag}`);

    // Note: In production, you'd pull the build artifacts from Jenkins
    // For now, we'll use local Dockerfile
    const buildResult = await buildImage(dockerfilePath, imageTag, ".");

    if (buildResult.success) {
      console.log(`✅ Docker image built successfully: ${imageTag}`);
      return {
        success: true,
        imageTag,
        logs: buildResult.logs,
      };
    } else {
      console.error(`❌ Docker build failed: ${buildResult.error}`);
      return {
        success: false,
        error: buildResult.error,
        logs: buildResult.logs,
      };
    }
  } catch (error) {
    console.error("❌ Error building Docker image:", error.message);
    return {
      success: false,
      error: error.message,
      logs: [],
    };
  }
};

/**
 * Push Docker image to registry (optional)
 */
export const pushDockerImage = async (imageTag) => {
  try {
    if (!DEPLOYMENT_CONFIG.DOCKER_REGISTRY || DEPLOYMENT_CONFIG.DOCKER_REGISTRY === "localhost") {
      console.log(`ℹ️  Local registry, skipping push for ${imageTag}`);
      return {
        success: true,
        skipped: true,
        message: "Local registry, push skipped",
      };
    }

    console.log(`📤 [Deployment] Pushing Docker image: ${imageTag}`);

    // Login if credentials provided
    if (DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME && DEPLOYMENT_CONFIG.DOCKER_REGISTRY_PASSWORD) {
      console.log(`🔐 [Deployment] Logging in to registry...`);
      await execAsync(
        `echo ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY_PASSWORD} | docker login -u ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME} --password-stdin ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY}`
      );
    }

    // Tag image for registry
    const registryTag = `${DEPLOYMENT_CONFIG.DOCKER_REGISTRY}/${imageTag}`;
    await execAsync(`docker tag ${imageTag} ${registryTag}`);

    // Push image
    const { stdout, stderr } = await execAsync(`docker push ${registryTag}`);
    console.log(`✅ Docker image pushed successfully: ${registryTag}`);

    return {
      success: true,
      registryTag,
      logs: (stdout + stderr).split("\n").filter(l => l),
    };
  } catch (error) {
    console.error("❌ Error pushing Docker image:", error.message);
    return {
      success: false,
      error: error.message,
      logs: [],
    };
  }
};

/**
 * Perform automatic deployment after successful build
 */
export const performAutomaticDeployment = async (
  buildNumber,
  jobName,
  webhookId,
  containerConfig
) => {
  const deploymentStartTime = Date.now();
  const logs = [];

  try {
    const {
      containerName,
      imageTag,
      environment = "production",
      userId,
      ports = [DEPLOYMENT_CONFIG.CONTAINER_PORT],
      env = [],
      volumes = [],
    } = containerConfig;

    logs.push(`[${new Date().toISOString()}] Starting automatic deployment after Jenkins build #${buildNumber}`);

    // Create deployment record
    const deployment = await Deployment.create({
      userId,
      version: imageTag,
      buildNumber,
      commitSha: containerConfig.commitSha,
      repository: containerConfig.repository,
      status: "in-progress",
      deploymentType: "auto",
      environment,
      deployedBy: `jenkins-webhook-${jobName}`,
      startTime: new Date(),
      containers: [
        {
          name: containerName,
          image: imageTag,
          status: "pending",
        },
      ],
    });

    logs.push(`✅ Deployment record created: ${deployment._id}`);

    // Emit Socket.io: deployment started
    emitDeploymentStarted({
      deploymentId: deployment._id.toString(),
      buildNumber,
      version: imageTag,
      containerName,
    });

    // Step 1: Wait for Jenkins build to complete
    logs.push(`[${new Date().toISOString()}] Step 1: Waiting for Jenkins build to complete...`);
    const buildResult = await waitForJenkinsBuild(buildNumber, jobName);

    if (!buildResult.success) {
      throw new Error(`Jenkins build failed or timed out: ${buildResult.error}`);
    }

    if (!buildResult.isSuccess) {
      throw new Error(`Jenkins build #${buildNumber} failed with result: ${buildResult.result}`);
    }

    logs.push(`✅ Jenkins build #${buildNumber} completed successfully`);

    // Emit Socket.io: build complete progress
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "build-complete",
      status: "completed",
      message: "Jenkins build completed successfully",
      progress: 20,
    });

    // Step 2: Build Docker image
    logs.push(`[${new Date().toISOString()}] Step 2: Building Docker image...`);
    const dockerBuildResult = await buildDockerImage(jobName, buildNumber, imageTag);

    if (!dockerBuildResult.success) {
      throw new Error(`Docker build failed: ${dockerBuildResult.error}`);
    }

    logs.push(...dockerBuildResult.logs.map(l => `  ${l}`));
    logs.push(`✅ Docker image built successfully`);

    // Emit Socket.io: docker build progress
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "docker-build",
      status: "completed",
      message: "Docker image built successfully",
      progress: 40,
    });

    // Step 3: Push image to registry (optional)
    logs.push(`[${new Date().toISOString()}] Step 3: Pushing Docker image to registry...`);
    const pushResult = await pushDockerImage(imageTag);

    if (!pushResult.success && !pushResult.skipped) {
      console.warn(`⚠️  Warning: Image push failed, but continuing with local deployment`);
      logs.push(`⚠️  Image push failed: ${pushResult.error}`);
    } else if (pushResult.skipped) {
      logs.push(`ℹ️  Registry push skipped (local registry)`);
    } else {
      logs.push(`✅ Docker image pushed successfully`);
    }

    // Emit Socket.io: push complete progress
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "docker-push",
      status: "completed",
      message: "Docker image pushed successfully",
      progress: 55,
    });

    // Step 4: Find and stop old container
    logs.push(`[${new Date().toISOString()}] Step 4: Stopping old container...`);
    const containersResult = await getContainers();
    let oldContainerId = null;

    if (containersResult.success && containersResult.containers) {
      const oldContainer = containersResult.containers.find(
        c => c.Names?.includes(`/${containerName}`) || c.Names?.includes(containerName)
      );
      if (oldContainer) {
        oldContainerId = oldContainer.ID;
        logs.push(`Found old container: ${oldContainerId}`);
        
        const stopResult = await stopContainer(oldContainerId, 30);
        if (stopResult.success) {
          logs.push(`✅ Old container stopped`);

          // Step 5: Remove old container
          logs.push(`[${new Date().toISOString()}] Step 5: Removing old container...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for graceful shutdown
          
          const removeResult = await removeContainer(oldContainerId, true);
          if (removeResult.success) {
            logs.push(`✅ Old container removed`);
          } else {
            console.warn(`⚠️  Could not remove old container: ${removeResult.error}`);
            logs.push(`⚠️  Could not remove old container`);
          }
        } else {
          console.warn(`⚠️  Could not stop old container: ${stopResult.error}`);
          logs.push(`⚠️  Could not stop old container`);
        }
      }
    }

    // Emit Socket.io: cleanup complete progress
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "cleanup",
      status: "completed",
      message: "Old containers cleaned up",
      progress: 75,
    });

    // Step 6: Start new container
    logs.push(`[${new Date().toISOString()}] Step 6: Starting new container...`);
    const newContainerName = `${containerName}-${Date.now()}`;
    
    const deployResult = await deployContainer({
      oldContainerId,
      image: imageTag,
      newContainerName,
      ports,
      env,
      volumes,
      userId,
    });

    if (!deployResult.success) {
      throw new Error(`Container deployment failed: ${deployResult.error}`);
    }

    logs.push(...deployResult.logs.map(l => `  ${l}`));
    const pruneResult = await pruneUnusedImages();
    if (pruneResult.success) {
      logs.push(`[${new Date().toISOString()}] Removed unused Docker images`);
      logs.push(...pruneResult.logs.map(l => `  ${l}`));
    } else {
      logs.push(`[${new Date().toISOString()}] Docker image prune warning: ${pruneResult.error}`);
    }
    logs.push(`✅ New container started successfully: ${deployResult.newContainerId}`);

    // Emit Socket.io: new container started
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "container-start",
      status: "completed",
      message: "New container started successfully",
      progress: 90,
    });

    // Step 7: Update deployment record
    const deploymentDuration = Date.now() - deploymentStartTime;
    const finalDeployment = await Deployment.findByIdAndUpdate(deployment._id, {
      status: "success",
      endTime: new Date(),
      duration: deploymentDuration,
      logs,
      containers: [
        {
          name: containerName,
          image: imageTag,
          status: "running",
        },
      ],
    }, { new: true });

    // Step 8: Update webhook record
    if (webhookId) {
      await Webhook.findByIdAndUpdate(webhookId, {
        deploymentTriggered: true,
        deploymentId: deployment._id,
        deploymentStatus: "success",
      });
    }

    // Step 9: Create success alert
    await createAlert(userId, {
      type: "deployment_auto_success",
      severity: "info",
      title: `Automatic Deployment Successful`,
      message: `Jenkins build #${buildNumber} deployed automatically. Image: ${imageTag}. Duration: ${Math.round(deploymentDuration / 1000)}s`,
      resourceType: "deployment",
      resourceId: deployment._id.toString(),
      metadata: {
        buildNumber,
        imageTag,
        containerName,
        duration: deploymentDuration,
      },
    });

    // Step 10: Save deployment logs
    await Log.create({
      userId,
      source: "deployment-automation",
      logType: "info",
      containerName,
      message: "Automatic deployment completed successfully",
      rawLog: logs.join("\n"),
        metadata: {
          buildNumber,
          imageTag,
          deploymentId: deployment._id,
          duration: deploymentDuration,
      },
    });

    console.log(`🎉 [Deployment] Automatic deployment completed successfully in ${Math.round(deploymentDuration / 1000)}s`);

    // Emit Socket.io: deployment succeeded
    emitDeploymentSucceeded({
      deploymentId: deployment._id.toString(),
      buildNumber,
      version: imageTag,
      containerName,
      duration: deploymentDuration,
      imageTag,
    });

    return {
      success: true,
      deploymentId: deployment._id,
      buildNumber,
      imageTag,
      containerName,
      duration: deploymentDuration,
      logs,
      deployment: finalDeployment,
    };
  } catch (error) {
    console.error("❌ [Deployment] Automatic deployment failed:", error.message);

    // Update deployment record with failure
    if (logs.length > 0) {
      const existingDeployment = await Deployment.findOne({
        status: "in-progress",
        deploymentType: "auto",
      }).sort({ createdAt: -1 });

      if (existingDeployment) {
        await Deployment.findByIdAndUpdate(existingDeployment._id, {
          status: "failed",
          endTime: new Date(),
          duration: Date.now() - deploymentStartTime,
          logs,
        });

        // Update webhook record
        if (webhookId) {
          await Webhook.findByIdAndUpdate(webhookId, {
            deploymentTriggered: true,
            deploymentStatus: "failed",
            deploymentError: error.message,
          });
        }

        // Create failure alert
        const deployment = await Deployment.findById(existingDeployment._id);
        await createAlert(deployment.userId || "system", {
          type: "deployment_auto_failed",
          severity: "critical",
          title: `Automatic Deployment Failed`,
          message: `Jenkins build #${buildNumber} automatic deployment failed: ${error.message}`,
          resourceType: "deployment",
          resourceId: existingDeployment._id.toString(),
          metadata: {
            buildNumber,
            error: error.message,
          },
        });

        // Emit Socket.io: deployment failed
        emitDeploymentFailed({
          deploymentId: existingDeployment._id.toString(),
          buildNumber,
          version: containerConfig?.imageTag || "unknown",
          containerName: containerConfig?.containerName || "unknown",
          error: error.message,
          failedStage: "deployment",
        });

        // Save failure logs
        await Log.create({
          userId: deployment.userId || "system",
          source: "deployment-automation",
          logType: "error",
          containerName: containerConfig.containerName,
          message: "Automatic deployment failed",
          rawLog: logs.join("\n"),
          metadata: {
            buildNumber,
            error: error.message,
            deploymentId: existingDeployment._id,
          },
        });
      }
    }

    return {
      success: false,
      error: error.message,
      logs,
    };
  }
};

/**
 * Trigger automatic deployment for webhook
 * Called from webhookService after successful Jenkins build
 */
export const triggerDeploymentForWebhook = async (
  webhookData,
  buildNumber,
  jobName,
  userId
) => {
  try {
    console.log(`🚀 [Deployment] Triggering automatic deployment for webhook`);

    // Extract deployment configuration from webhook
    const containerConfig = {
      containerName: process.env.CONTAINER_NAME || "devops-hub-app",
      imageTag: `${process.env.DOCKER_REGISTRY || "localhost"}/devops-hub:${webhookData.commit.sha.substring(0, 7)}`,
      environment: process.env.ENVIRONMENT || "production",
      userId,
      ports: (process.env.CONTAINER_PORTS || "3000").split(","),
      env: (process.env.CONTAINER_ENV || "NODE_ENV=production").split(","),
      volumes: (process.env.CONTAINER_VOLUMES || "").split(",").filter(v => v),
      commitSha: webhookData.commit?.sha,
      repository: webhookData.repository?.fullName || webhookData.repository?.name,
    };

    // Perform deployment
    const result = await performAutomaticDeployment(
      buildNumber,
      jobName,
      webhookData._id,
      containerConfig
    );

    return result;
  } catch (error) {
    console.error("❌ Error triggering deployment for webhook:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default {
  waitForJenkinsBuild,
  buildDockerImage,
  pushDockerImage,
  performAutomaticDeployment,
  triggerDeploymentForWebhook,
};
