import { Deployment } from "../models/Deployment.js";
import { JenkinsJob } from "../models/JenkinsJob.js";
import { GitHubWebhookConfig } from "../models/GitHubWebhookConfig.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { isDbConnected } from "../db.js";
import { createJenkinsJob } from "./jenkinsJobService.js";
import { createGitHubWebhook } from "./githubWebhookConfigService.js";
import { getJenkinsStatus, jenkinsValidationPassed } from "./jenkinsConnectionService.js";
import { getDockerHubStatus } from "./dockerHubRegistryService.js";
import { enableAutoDeploy, getAutoDeployPreconditions } from "./autoDeployService.js";
import { broadcastToRoom, emitPipelineStatusUpdate } from "./socketEventsService.js";

/**
 * Automated One-Click CI/CD Setup Service
 * 
 * This service orchestrates the complete setup flow when user clicks "Enable Auto Deploy":
 * 1. Verify all connections are ready
 * 2. Automatically create Jenkins job
 * 3. Automatically create GitHub webhook
 * 4. Enable auto-deploy
 * 5. Track progress and report status
 */

const SETUP_STAGES = [
  "VERIFY_CONNECTIONS",
  "CREATE_JENKINS_JOB",
  "CREATE_GITHUB_WEBHOOK",
  "ENABLE_AUTO_DEPLOY",
  "COMPLETE",
];

/**
 * Log setup progress for debugging and UI updates
 */
function logProgress(stage, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Automated Setup] [${stage}] ${timestamp} - ${message}`, data);
}

function deploymentLogEntry(message, level = "info") {
  return {
    timestamp: new Date(),
    level,
    message: String(message),
  };
}

/**
 * Broadcast progress update to frontend
 */
async function broadcastProgress(deploymentId, stage, status, message, details = {}) {
  emitPipelineStatusUpdate({
    deploymentId,
    stage: `Auto Setup: ${stage}`,
    status,
    message,
    progress: getStageProgress(stage),
    details,
  });

  broadcastToRoom("pipeline", "setup:progress", {
    deploymentId,
    stage,
    status,
    message,
    details,
    timestamp: new Date(),
  });
}

/**
 * Get progress percentage based on stage
 */
function getStageProgress(stage) {
  const stageIndex = SETUP_STAGES.indexOf(stage);
  if (stageIndex === -1) return 0;
  return Math.round((stageIndex / SETUP_STAGES.length) * 100);
}

/**
 * Verify all prerequisites before starting automation
 */
async function verifyConnections(userId) {
  logProgress("VERIFY_CONNECTIONS", "Starting verification...");

  try {
    const [jenkins, dockerHub, awsConnection] = await Promise.all([
      getJenkinsStatus(userId),
      getDockerHubStatus(userId),
      isDbConnected() ? AWSConnection.findOne({ userId, connected: true }).lean() : null,
    ]);

    const jenkinsOk = jenkinsValidationPassed(jenkins.status);
    const dockerOk = dockerHub.status?.connected && dockerHub.status?.permissions?.push;
    const awsOk = Boolean(awsConnection);

    logProgress("VERIFY_CONNECTIONS", "Verification complete", {
      jenkins: jenkinsOk,
      docker: dockerOk,
      aws: awsOk,
    });

    if (!jenkinsOk) throw new Error("Jenkins connection failed validation");
    if (!dockerOk) throw new Error("Docker Hub connection failed validation");
    if (!awsOk) throw new Error("AWS Account connection failed validation. EC2 will be auto-provisioned after connecting AWS.");

    return { success: true, jenkins: jenkins.status, dockerHub: dockerHub.status, awsConnection };
  } catch (error) {
    logProgress("VERIFY_CONNECTIONS", "Verification failed", { error: error.message });
    throw new Error(`Connection verification failed: ${error.message}`);
  }
}

/**
 * Automatically create Jenkins job
 */
async function autoCreateJenkinsJob(userId, deployment, deploymentId) {
  logProgress("CREATE_JENKINS_JOB", "Starting Jenkins job creation...", {
    owner: deployment.owner,
    repo: deployment.repository,
    branch: deployment.branch,
  });

  try {
    const result = await createJenkinsJob(userId, {
      owner: deployment.owner,
      repo: deployment.repository,
      branch: deployment.branch || "main",
      jenkinsfilePath: deployment.jenkinsfilePath || "Jenkinsfile",
      repositoryUrl: `https://github.com/${deployment.owner}/${deployment.repository}.git`,
      force: false,
    });

    if (!result.success) {
      // If job already exists (duplicate), that's okay - use it
      if (result.duplicate && result.job) {
        logProgress("CREATE_JENKINS_JOB", "Jenkins job already exists, using existing job", {
          jobName: result.job.jobName,
        });
        return { success: true, job: result.job, existing: true };
      }
      throw new Error(result.message || "Failed to create Jenkins job");
    }

    logProgress("CREATE_JENKINS_JOB", "Jenkins job created successfully", {
      jobName: result.job.jobName,
      jobId: result.job.jobId,
    });

    // Update deployment with Jenkins job info
    if (isDbConnected()) {
      await Deployment.updateOne(
        { deploymentId, userId },
        {
          "setup.jenkinsJobCreated": true,
          jenkins: {
            jobId: result.job.jobId,
            jobName: result.job.jobName,
            jobUrl: result.job.jobUrl,
          },
          "setup.updatedAt": new Date(),
          updatedAt: new Date(),
          $push: {
            logs: deploymentLogEntry(`[Auto Setup] Jenkins job created: ${result.job.jobName}`),
          },
        }
      );
    }

    return { success: true, job: result.job, existing: false };
  } catch (error) {
    logProgress("CREATE_JENKINS_JOB", "Jenkins job creation failed", { error: error.message });
    throw new Error(`Jenkins job creation failed: ${error.message}`);
  }
}

/**
 * Automatically create GitHub webhook
 */
async function autoCreateGitHubWebhook(userId, deployment, deploymentId, jenkinsStatus) {
  logProgress("CREATE_GITHUB_WEBHOOK", "Starting GitHub webhook creation...", {
    owner: deployment.owner,
    repo: deployment.repository,
  });

  try {
    const result = await createGitHubWebhook(userId, {
      owner: deployment.owner,
      repo: deployment.repository,
      branch: deployment.branch || "main",
      webhookUrl: jenkinsStatus.webhookUrl || `${jenkinsStatus.url}/github-webhook/`,
    });

    if (!result.success) {
      // If webhook already exists (duplicate), that's okay - use it
      if (result.duplicate && result.webhook) {
        logProgress("CREATE_GITHUB_WEBHOOK", "GitHub webhook already exists, using existing webhook", {
          webhookUrl: result.webhook.webhookUrl,
        });
        return { success: true, webhook: result.webhook, existing: true };
      }
      throw new Error(result.message || "Failed to create GitHub webhook");
    }

    logProgress("CREATE_GITHUB_WEBHOOK", "GitHub webhook created successfully", {
      webhookUrl: result.webhook.webhookUrl,
      webhookId: result.webhook.hookId,
    });

    // Update deployment with webhook info
    if (isDbConnected()) {
      await Deployment.updateOne(
        { deploymentId, userId },
        {
          "setup.githubWebhookConfigured": true,
          githubWebhook: {
            hookId: result.webhook.hookId,
            webhookUrl: result.webhook.webhookUrl,
            events: result.webhook.events,
          },
          "setup.updatedAt": new Date(),
          updatedAt: new Date(),
          $push: {
            logs: deploymentLogEntry("[Auto Setup] GitHub webhook created"),
          },
        }
      );
    }

    return { success: true, webhook: result.webhook, existing: false };
  } catch (error) {
    logProgress("CREATE_GITHUB_WEBHOOK", "GitHub webhook creation failed", { error: error.message });
    throw new Error(`GitHub webhook creation failed: ${error.message}`);
  }
}

/**
 * Verify CI/CD setup is complete and working
 */
async function verifyCICDSetup(userId, deployment) {
  logProgress("VERIFY_CICD", "Verifying CI/CD setup...", {
    owner: deployment.owner,
    repo: deployment.repository,
  });

  try {
    const preconditions = await getAutoDeployPreconditions(userId, {
      owner: deployment.owner,
      repo: deployment.repository,
      branch: deployment.branch || "main",
    });

    const allMet = preconditions.checks.every((c) => c.ok);

    if (!allMet) {
      const failed = preconditions.checks.filter((c) => !c.ok);
      logProgress("VERIFY_CICD", "CI/CD verification incomplete", {
        failed: failed.map((f) => f.label),
      });
      return { success: false, preconditions: preconditions.checks, failed };
    }

    logProgress("VERIFY_CICD", "CI/CD verification complete", {
      checks: preconditions.checks.length,
    });

    return { success: true, preconditions: preconditions.checks };
  } catch (error) {
    logProgress("VERIFY_CICD", "CI/CD verification error", { error: error.message });
    // Don't throw - verification might fail due to network issues, but setup can still proceed
    return { success: false, error: error.message };
  }
}

/**
 * Main orchestration: Automated one-click CI/CD setup
 */
export async function automatedOneClickSetup(userId, payload = {}) {
  const { deploymentId, owner, repo, branch } = payload;

  if (!deploymentId || !owner || !repo) {
    throw new Error("deploymentId, owner, and repo are required");
  }

  logProgress("START", "Beginning automated one-click CI/CD setup", {
    deploymentId,
    owner,
    repo,
    branch: branch || "main",
  });

  const setupLog = [];
  let currentStage = null;

  try {
    // Stage 1: Verify connections
    currentStage = "VERIFY_CONNECTIONS";
    logProgress(currentStage, "Stage starting");

    const verification = await verifyConnections(userId);
    setupLog.push("✅ All connections verified");

    // Get deployment info
    const deployment = await Deployment.findOne({
      deploymentId,
      userId,
    }).lean();

    if (!deployment) {
      throw new Error("Deployment not found");
    }

    // Stage 2: Create Jenkins Job
    currentStage = "CREATE_JENKINS_JOB";
    logProgress(currentStage, "Stage starting");

    const jenkinsResult = await autoCreateJenkinsJob(userId, deployment, deploymentId);
    setupLog.push(`✅ Jenkins job created: ${jenkinsResult.job.jobName}`);

    // Stage 3: Create GitHub Webhook
    currentStage = "CREATE_GITHUB_WEBHOOK";
    logProgress(currentStage, "Stage starting");

    const webhookResult = await autoCreateGitHubWebhook(userId, deployment, deploymentId, verification.jenkins);
    setupLog.push(`✅ GitHub webhook created`);

    // Stage 4: Enable Auto Deploy
    currentStage = "ENABLE_AUTO_DEPLOY";
    logProgress(currentStage, "Stage starting");

    const autoDeployResult = await enableAutoDeploy(userId, {
      deploymentId,
      owner: deployment.owner,
      repo: deployment.repository,
      branch: deployment.branch,
    });

    if (!autoDeployResult.success) {
      setupLog.push(`⚠️ Auto Deploy may need retry: ${autoDeployResult.message}`);
      logProgress(currentStage, "Auto Deploy enable warning", {
        message: autoDeployResult.message,
      });
    } else {
      setupLog.push(`✅ Auto Deploy enabled`);
    }

    // Stage 5: Final verification
    currentStage = "COMPLETE";
    logProgress(currentStage, "Verifying complete setup");

    const finalVerification = await verifyCICDSetup(userId, deployment);
    if (!finalVerification.success) {
      setupLog.push(`⚠️ Some preconditions incomplete: ${finalVerification.failed?.map((f) => f.label).join(", ")}`);
    } else {
      setupLog.push(`✅ All preconditions met`);
    }

    // Update deployment with complete setup info
    if (isDbConnected()) {
      await Deployment.updateOne(
        { deploymentId, userId },
        {
          deploymentStage: "AUTO_DEPLOY_ENABLED",
          status: "success",
          deploymentType: "auto",
          "setup.autoDeployEnabled": true,
          "setup.autoDeployEnabledAt": new Date(),
          "setup.updatedAt": new Date(),
          updatedAt: new Date(),
          $push: {
            logs: {
              $each: setupLog.map((message) => deploymentLogEntry(message)),
            },
          },
        }
      );
    }

    logProgress("COMPLETE", "Automated setup completed successfully");

    return {
      success: true,
      message: "One-click CI/CD setup completed successfully",
      deploymentId,
      stage: currentStage,
      logs: setupLog,
      jenkins: {
        jobId: jenkinsResult.job.jobId,
        jobName: jenkinsResult.job.jobName,
        jobUrl: jenkinsResult.job.jobUrl,
      },
      webhook: {
        hookId: webhookResult.webhook.hookId,
        webhookUrl: webhookResult.webhook.webhookUrl,
      },
      autoDeploy: autoDeployResult.autoDeploy,
    };
  } catch (error) {
    logProgress(currentStage || "UNKNOWN", "Setup stage failed", {
      error: error.message,
      stack: error.stack,
    });

    // Update deployment with error
    if (isDbConnected()) {
      try {
        await Deployment.updateOne(
          { deploymentId, userId },
          {
            "setup.autoDeployError": error.message,
            "setup.autoDeployErrorAt": new Date(),
            $push: {
              logs: deploymentLogEntry(`❌ Setup failed at ${currentStage}: ${error.message}`, "error"),
            },
          }
        );
      } catch (updateError) {
        logProgress("ERROR_UPDATE", "Failed to update deployment with error", {
          error: updateError.message,
        });
      }
    }

    return {
      success: false,
      message: `Automated setup failed: ${error.message}`,
      deploymentId,
      stage: currentStage,
      error: error.message,
      logs: setupLog,
    };
  }
}

/**
 * Get the status of an ongoing automated setup
 */
export async function getAutomatedSetupStatus(userId, deploymentId) {
  try {
    const deployment = await Deployment.findOne({
      deploymentId,
      userId,
    }).lean();

    if (!deployment) {
      return { success: false, error: "Deployment not found" };
    }

    return {
      success: true,
      status: {
        autoDeployEnabled: deployment.setup?.autoDeployEnabled,
        jenkinsJobCreated: deployment.setup?.jenkinsJobCreated,
        githubWebhookConfigured: deployment.setup?.githubWebhookConfigured,
        error: deployment.setup?.autoDeployError,
        errorAt: deployment.setup?.autoDeployErrorAt,
        logs: deployment.logs?.slice(-20) || [], // Last 20 logs
      },
    };
  } catch (error) {
    logProgress("GET_STATUS", "Failed to get setup status", { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Retry failed automated setup step
 */
export async function retryAutomatedSetup(userId, deploymentId) {
  logProgress("RETRY", "Retrying automated setup");

  const deployment = await Deployment.findOne({
    deploymentId,
    userId,
  }).lean();

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  // Clear previous error
  if (isDbConnected()) {
    await Deployment.updateOne(
      { deploymentId, userId },
      {
        $unset: {
          "setup.autoDeployError": "",
          "setup.autoDeployErrorAt": "",
        },
      }
    );
  }

  return automatedOneClickSetup(userId, {
    deploymentId,
    owner: deployment.owner,
    repo: deployment.repository,
    branch: deployment.branch,
  });
}
