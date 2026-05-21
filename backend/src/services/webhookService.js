import { Webhook } from "../models/Webhook.js";
import { triggerJenkinsPipeline } from "./jenkinsService.js";
import { triggerDeploymentForWebhook } from "./deploymentAutomationService.js";
import { deployGitHubRepository } from "./githubPipelineService.js";
import deploymentOrchestrationService from "./deploymentOrchestrationService.js";
import { isDbConnected } from "../db.js";
import { Log } from "../models/Logs.js";
import { createAlert } from "./alertService.js";
import {
  emitNewLog,
  emitPipelineStatusUpdate,
  emitWebhookReceived,
} from "./socketEventsService.js";

/**
 * Process GitHub webhook event
 */
export const processWebhookEvent = async (eventType, webhookData, rawPayload) => {
  const enableAutoDeployment = process.env.ENABLE_AUTO_DEPLOYMENT !== "false";
  const webhookDeploymentMode = process.env.WEBHOOK_DEPLOYMENT_MODE || "jenkins";
  
  try {
    console.log(`📝 [Webhook] Processing ${eventType} event from ${webhookData.repository.name}`);

    // Prepare webhook document
    const webhookDoc = {
      event: webhookData.event,
      repository: webhookData.repository,
      commit: webhookData.commit,
      branch: webhookData.branch,
      pusher: webhookData.pusher,
      status: "pending",
      rawPayload,
    };

    // Save webhook to database
    let savedWebhook;
    if (isDbConnected()) {
      savedWebhook = await Webhook.create(webhookDoc);
      console.log(`✅ Webhook saved to database: ${savedWebhook._id}`);
      const log = await Log.create({
        userId: webhookData.pusher?.email || webhookData.pusher?.name || "webhook-user",
        source: "webhook",
        logType: "info",
        message: `GitHub ${eventType} received for ${webhookData.repository.fullName || webhookData.repository.name}`,
        rawLog: JSON.stringify({
          repository: webhookData.repository.fullName,
          branch: webhookData.branch,
          commit: webhookData.commit?.sha,
          message: webhookData.commit?.message,
          author: webhookData.commit?.author?.name,
        }),
        metadata: { stage: "github-webhook", status: "received" },
      });

      emitNewLog({
        _id: log._id,
        source: log.source,
        logType: log.logType,
        message: log.message,
        rawLog: log.rawLog,
      });
    } else {
      console.warn("⚠️  Database not connected, skipping webhook storage");
    }

    emitWebhookReceived({
      webhookId: savedWebhook?._id?.toString(),
      event: eventType,
      repository: webhookData.repository.fullName || webhookData.repository.name,
      branch: webhookData.branch,
      commit: webhookData.commit?.sha,
      author: webhookData.commit?.author?.name,
    });

    // Check for fully automated deployment mode
    if (eventType === "push" && enableAutoDeployment && webhookDeploymentMode === "fully-automated") {
      console.log(`🚀 [Webhook] Starting FULLY AUTOMATED deployment for ${webhookData.repository.fullName}`);

      // Execute orchestration in background (non-blocking)
      deploymentOrchestrationService
        .executeFullAutomatedDeployment({
          repository: {
            clone_url: webhookData.repository.cloneUrl || `${webhookData.repository.url}.git`,
            name: webhookData.repository.name,
            id: webhookData.repository.id,
            fullName: webhookData.repository.fullName,
          },
          ref: webhookData.ref || `refs/heads/${webhookData.branch || "main"}`,
          after: webhookData.commit?.sha,
          _id: savedWebhook?._id?.toString(),
        })
        .catch((error) => {
          console.error("❌ Background orchestration error:", error);
        });

      return {
        success: true,
        webhookId: savedWebhook?._id,
        deploymentMode: "fully-automated",
        message: `🚀 Full automated deployment initiated for ${webhookData.repository.name}. Monitoring deployment...`,
      };
    }

    if (eventType === "push" && enableAutoDeployment && webhookDeploymentMode === "direct") {
      console.log(`🚀 [Webhook] Starting direct Docker deployment for ${webhookData.repository.fullName}`);

      const deploymentResult = await deployGitHubRepository({
        repoUrl: webhookData.repository.cloneUrl || `${webhookData.repository.url}.git`,
        branch: webhookData.branch || "main",
        containerName: process.env.WEBHOOK_CONTAINER_NAME || webhookData.repository.name,
        dockerfilePath: process.env.WEBHOOK_BUILD_FILE_PATH || process.env.WEBHOOK_DOCKERFILE_PATH || "auto",
        ports: (process.env.WEBHOOK_CONTAINER_PORTS || process.env.CONTAINER_PORTS || "3000:3000")
          .split(",")
          .map((port) => port.trim())
          .filter(Boolean),
        env: (process.env.WEBHOOK_CONTAINER_ENV || process.env.CONTAINER_ENV || "NODE_ENV=production")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        volumes: (process.env.WEBHOOK_CONTAINER_VOLUMES || process.env.CONTAINER_VOLUMES || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        environment: process.env.WEBHOOK_ENVIRONMENT || process.env.ENVIRONMENT || "production",
        userId: webhookData.pusher?.email || webhookData.pusher?.name || "webhook-user",
        deployedBy: `github-webhook:${webhookData.pusher?.name || "unknown"}`,
      });

      if (isDbConnected() && savedWebhook) {
        await Webhook.findByIdAndUpdate(savedWebhook._id, {
          deploymentTriggered: true,
          deploymentId: deploymentResult.deployment?._id || deploymentResult.deploymentId,
          deploymentStatus: deploymentResult.success ? "success" : "failed",
          deploymentError: deploymentResult.success ? undefined : deploymentResult.error,
          deploymentStartTime: savedWebhook.createdAt,
          deploymentEndTime: new Date(),
          deploymentImageTag: deploymentResult.imageTag,
          status: deploymentResult.success ? "success" : "failed",
          errorMessage: deploymentResult.success ? undefined : deploymentResult.error,
        });
      }

      return {
        success: deploymentResult.success,
        webhookId: savedWebhook?._id,
        deploymentId: deploymentResult.deployment?._id || deploymentResult.deploymentId,
        imageTag: deploymentResult.imageTag,
        containerName: deploymentResult.containerName,
        error: deploymentResult.error,
        message: deploymentResult.success
          ? `Webhook push deployed ${deploymentResult.imageTag} as ${deploymentResult.containerName}.`
          : `Webhook push received, but deployment failed: ${deploymentResult.error}`,
      };
    }

    // Trigger Jenkins pipeline
    console.log(`🔄 Triggering Jenkins pipeline...`);
    const jenkinResult = await triggerJenkinsPipeline({
      ...webhookData,
      projectName: process.env.WEBHOOK_CONTAINER_NAME || webhookData.repository.name,
      buildFilePath: process.env.WEBHOOK_BUILD_FILE_PATH || process.env.WEBHOOK_DOCKERFILE_PATH || "auto",
      ports: process.env.WEBHOOK_CONTAINER_PORTS || process.env.CONTAINER_PORTS || "3000:3000",
      environment: process.env.WEBHOOK_ENVIRONMENT || process.env.ENVIRONMENT || "production",
    });

    if (jenkinResult.success) {
      // Update webhook with Jenkins build info
      if (isDbConnected() && savedWebhook) {
        await Webhook.findByIdAndUpdate(savedWebhook._id, {
          jenkinsPipelineTriggered: true,
          jenkinsBuildNumber: jenkinResult.buildNumber,
          status: "success",
        });
      }

      console.log(`✅ Jenkins pipeline triggered successfully`);

      emitPipelineStatusUpdate({
        status: "triggered",
        stage: "jenkins",
        progress: 10,
        buildNumber: jenkinResult.buildNumber,
      });

      // Trigger automatic Docker deployment if enabled
      if (process.env.WEBHOOK_ENABLE_POST_JENKINS_DEPLOY === "true" && isDbConnected() && savedWebhook) {
        console.log(`🚀 [Webhook] Triggering automatic Docker deployment...`);
        
        // Trigger deployment in background (don't wait for it to complete)
        triggerDeploymentForWebhook(
          savedWebhook,
          jenkinResult.buildNumber,
          process.env.JENKINS_JOB_NAME || "devops-hub-deploy",
          webhookData.pusher?.email || "webhook-user"
        ).catch(error => {
          console.error("❌ Background deployment error:", error.message);
        });
      }

      return {
        success: true,
        webhookId: savedWebhook?._id,
        buildNumber: jenkinResult.buildNumber,
        buildUrl: jenkinResult.buildUrl,
        deploymentTriggered: process.env.WEBHOOK_ENABLE_POST_JENKINS_DEPLOY === "true",
        message: process.env.WEBHOOK_ENABLE_POST_JENKINS_DEPLOY === "true"
          ? `Webhook processed successfully. Jenkins build #${jenkinResult.buildNumber} started. Automatic Docker deployment queued.`
          : `Webhook processed successfully. Jenkins build #${jenkinResult.buildNumber} started.`,
      };
    } else {
      // Update webhook with error
      if (isDbConnected() && savedWebhook) {
        await Webhook.findByIdAndUpdate(savedWebhook._id, {
          jenkinsPipelineTriggered: false,
          status: "failed",
          errorMessage: jenkinResult.error,
        });
      }

      console.warn(`⚠️  Jenkins trigger failed: ${jenkinResult.error}`);
      await createAlert(webhookData.pusher?.email || webhookData.pusher?.name || "webhook-user", {
        type: "jenkins_build_failed",
        severity: "critical",
        title: "Jenkins Trigger Failed",
        message: jenkinResult.error,
        resourceType: "pipeline",
        resourceId: savedWebhook?._id?.toString(),
      });

      return {
        success: false,
        webhookId: savedWebhook?._id,
        error: jenkinResult.error,
        message: `Webhook received but Jenkins trigger failed: ${jenkinResult.error}`,
      };
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error.message);

    // Try to save error webhook
    if (isDbConnected()) {
      try {
        await Webhook.create({
          event: webhookData.event || "unknown",
          repository: webhookData.repository || {},
          status: "failed",
          errorMessage: error.message,
          rawPayload,
        });
      } catch (saveError) {
        console.error("Failed to save error webhook:", saveError.message);
      }
    }

    throw error;
  }
};

/**
 * Get webhook history
 */
export const getWebhookHistory = async (limit = 50, skip = 0) => {
  try {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const webhooks = await Webhook.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-rawPayload"); // Exclude raw payload for performance

    const total = await Webhook.countDocuments();

    return {
      webhooks,
      total,
      limit,
      skip,
    };
  } catch (error) {
    console.error("❌ Error fetching webhook history:", error.message);
    throw error;
  }
};

/**
 * Get webhook by ID
 */
export const getWebhookById = async (webhookId) => {
  try {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const webhook = await Webhook.findById(webhookId);

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    return webhook;
  } catch (error) {
    console.error("❌ Error fetching webhook:", error.message);
    throw error;
  }
};

/**
 * Get webhooks by repository
 */
export const getWebhooksByRepository = async (repoName, limit = 20, skip = 0) => {
  try {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const webhooks = await Webhook.find({ "repository.name": repoName })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-rawPayload");

    const total = await Webhook.countDocuments({ "repository.name": repoName });

    return {
      repository: repoName,
      webhooks,
      total,
      limit,
      skip,
    };
  } catch (error) {
    console.error("❌ Error fetching repository webhooks:", error.message);
    throw error;
  }
};

/**
 * Get webhook statistics
 */
export const getWebhookStats = async () => {
  try {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const stats = await Webhook.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const eventStats = await Webhook.aggregate([
      {
        $group: {
          _id: "$event",
          count: { $sum: 1 },
        },
      },
    ]);

    const repoStats = await Webhook.aggregate([
      {
        $group: {
          _id: "$repository.name",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return {
      statusStats: stats,
      eventStats,
      topRepositories: repoStats,
      total: await Webhook.countDocuments(),
    };
  } catch (error) {
    console.error("❌ Error calculating webhook stats:", error.message);
    throw error;
  }
};

/**
 * Delete webhook by ID
 */
export const deleteWebhook = async (webhookId) => {
  try {
    if (!isDbConnected()) {
      throw new Error("Database not connected");
    }

    const result = await Webhook.findByIdAndDelete(webhookId);

    if (!result) {
      throw new Error("Webhook not found");
    }

    return result;
  } catch (error) {
    console.error("❌ Error deleting webhook:", error.message);
    throw error;
  }
};
