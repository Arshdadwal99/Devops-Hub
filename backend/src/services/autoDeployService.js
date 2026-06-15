import { AutoDeploy } from "../models/AutoDeploy.js";
import { BuildHistory } from "../models/BuildHistory.js";
import { Deployment } from "../models/Deployment.js";
import { isDbConnected } from "../db.js";
import { configureJenkinsJobAutoDeploy } from "./jenkinsJobService.js";
import { createGitHubWebhook } from "./githubWebhookConfigService.js";
import { broadcastToRoom, emitPipelineStatusUpdate } from "./socketEventsService.js";
import { calculateAutoDeployValidationState } from "./workflowStateService.js";

const WORKFLOW = [
  "GitHub Push",
  "GitHub Webhook",
  "Jenkins Job Trigger",
  "Build Docker Image",
  "Push Docker Hub",
  "Deploy EC2",
  "Health Check",
];

const STATUS_ORDER = [
  "QUEUED",
  "BUILDING",
  "TESTING",
  "PUSHING",
  "DEPLOYING",
  "HEALTH_CHECK",
  "SUCCESS",
  "FAILED",
];

function repositoryFullName(owner, repo) {
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

function pass(label, ok, detail = null) {
  return { label, ok: Boolean(ok), detail };
}

function toPublicConfig(config, extras = {}) {
  if (!config) {
    return {
      enabled: false,
      status: "DISABLED",
      workflow: WORKFLOW,
      logs: [],
      ...extras,
    };
  }

  const plain = typeof config.toObject === "function" ? config.toObject() : config;
  return {
    id: String(plain._id),
    enabled: Boolean(plain.enabled),
    status: plain.status || (plain.enabled ? "QUEUED" : "DISABLED"),
    repository: plain.repository,
    jenkinsJob: plain.jenkinsJob,
    githubWebhook: plain.githubWebhook,
    dockerHub: plain.dockerHub,
    ec2: plain.ec2,
    workflow: plain.workflow || WORKFLOW,
    deploymentId: plain.deploymentId,
    enabledAt: plain.enabledAt,
    disabledAt: plain.disabledAt,
    lastRunAt: plain.lastRunAt,
    logs: plain.logs || [],
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...extras,
  };
}

function mapJenkinsBuildToAutoDeployStatus(build) {
  if (!build) return null;
  if (build.status === "SUCCESS") return "SUCCESS";
  if (["FAILURE", "ABORTED", "UNSTABLE"].includes(build.status)) return "FAILED";

  const stageNames = (build.stages || []).map((stage) => String(stage.name || "").toLowerCase());
  if (stageNames.some((name) => name.includes("health"))) return "HEALTH_CHECK";
  if (stageNames.some((name) => name.includes("deploy"))) return "DEPLOYING";
  if (stageNames.some((name) => name.includes("push"))) return "PUSHING";
  if (stageNames.some((name) => name.includes("test"))) return "TESTING";
  if (stageNames.some((name) => name.includes("build"))) return "BUILDING";
  if (build.status === "RUNNING") return "BUILDING";
  return "QUEUED";
}

async function ensureDeploymentHistoryFromBuild(userId, config, build, status) {
  if (!build || !config?.enabled) return null;

  const deploymentStatus = status === "SUCCESS" ? "success" : status === "FAILED" ? "failed" : "in-progress";
  const deploymentId = `jenkins-${build.jobName}-${build.buildNumber}`;
  const logs = [
    `GitHub Push -> GitHub Webhook -> Jenkins Job Trigger`,
    `Jenkins job ${build.jobName} build #${build.buildNumber}: ${status}`,
    ...(build.logs?.tail ? [build.logs.tail] : []),
  ];

  return Deployment.findOneAndUpdate(
    { userId, deploymentId },
    {
      userId,
      deploymentId,
      repository: config.repository?.name,
      owner: config.repository?.owner,
      branch: build.sourceCode?.branch || config.repository?.branch,
      version: build.sourceCode?.commit || `build-${build.buildNumber}`,
      status: deploymentStatus,
      deploymentType: "auto",
      autoDeployStatus: status,
      commitSha: build.sourceCode?.commit,
      deployedBy: "jenkins-auto-deploy",
      startTime: build.startTime || build.timestamp,
      endTime: deploymentStatus === "in-progress" ? null : (build.endTime || new Date()),
      duration: build.duration,
      jenkins: {
        jobName: build.jobName,
        jobUrl: config.jenkinsJob?.jobUrl,
        buildNumber: build.buildNumber,
        buildUrl: build.buildUrl,
      },
      currentImageTag: build.parameters?.DOCKER_IMAGE || build.version,
      logs,
      updatedAt: new Date(),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

async function findAutoDeployConfig(userId, { owner, repo, branch } = {}) {
  const query = { userId };
  if (owner && repo) query["repository.fullName"] = repositoryFullName(owner, repo);
  if (branch) query["repository.branch"] = branch;

  return AutoDeploy.findOne(query).sort({ updatedAt: -1 }).lean();
}

async function updatePipelineAutoDeployStage(userId, { owner, repo, branch, enabled }) {
  const query = { userId, provider: "jenkins" };
  if (owner && repo) {
    query["repository.owner"] = owner;
    query["repository.name"] = repo;
  }
  if (branch) query["repository.branch"] = branch;

  const now = new Date();
  const update = {
    autoDeploy: {
      enabled,
      enabledAt: enabled ? now : undefined,
      disabledAt: enabled ? undefined : now,
      status: enabled ? "QUEUED" : "DISABLED",
      workflow: WORKFLOW,
    },
    updatedAt: now,
    "stages.$[stage].status": enabled ? "success" : "pending",
    "stages.$[stage].logs": [
      enabled
        ? "Auto deploy enabled for GitHub push events"
        : "Auto deploy disabled for GitHub push events",
    ],
  };

  await Pipeline.updateMany(query, { $set: update }, {
    arrayFilters: [{ "stage.name": "Enable Auto Deploy" }],
  }).catch((error) => {
    console.warn("[Auto Deploy] Failed to update pipeline stage:", error.message);
  });
}

async function updateDeploymentSetup(userId, { deploymentId, owner, repo, enabled }) {
  const query = { userId };
  if (deploymentId) {
    query.deploymentId = deploymentId;
  } else if (owner && repo) {
    query.owner = owner;
    query.repository = repo;
  } else {
    return null;
  }

  return Deployment.findOneAndUpdate(
    query,
    {
      deploymentStage: enabled ? "AUTO_DEPLOY_ENABLED" : "CICD_GENERATED",
      deploymentType: enabled ? "auto" : "workspace-prepare",
      status: enabled ? "success" : "READY_FOR_BUILD",
      autoDeployStatus: enabled ? "QUEUED" : undefined,
      "setup.autoDeployEnabled": enabled,
      "setup.autoDeployEnabledAt": enabled ? new Date() : null,
      "setup.updatedAt": new Date(),
      updatedAt: new Date(),
      $push: {
        logs: enabled
          ? "Auto Deploy Enabled: GitHub pushes now trigger the Jenkins deployment job"
          : "Auto Deploy Disabled: GitHub pushes no longer trigger this Jenkins job",
      },
    },
    { new: true }
  ).lean();
}

export async function getAutoDeployPreconditions(userId, query = {}) {
  if (!isDbConnected()) throw new Error("Database not connected");

  const owner = query.owner;
  const repo = query.repo;
  const branch = query.branch;
  
  console.log("[Auto Deploy] Getting preconditions for:", { userId, owner, repo, branch });

  const validationState = await calculateAutoDeployValidationState(userId, query);
  const checks = validationState.checks;

  console.log("[Auto Deploy] Precondition checks:", checks.map(c => ({ label: c.label, ok: c.ok })));

  return {
    ...validationState,
    checks,
  };
}

export async function enableAutoDeploy(userId, payload = {}) {
  const preconditions = await getAutoDeployPreconditions(userId, payload);
  const failed = preconditions.requirementRows
    ? preconditions.requirementRows.filter((check) => preconditions.missingRequirements.includes(check.label))
    : preconditions.checks.filter((check) => !check.ok);
  
  console.log("[Auto Deploy] Enable attempt with preconditions:", {
    allPassed: failed.length === 0,
    failed: failed.map(f => f.label),
  });
  
  if (failed.length) {
    console.log("[Auto Deploy] Cannot enable - missing:", failed.map(c => c.label).join(", "));
    return {
      success: false,
      message: "Auto deploy preconditions are not complete.",
      preconditions: preconditions.checks,
      missing: failed.map((check) => check.label),
      debug: {
        workflowState: preconditions.workflowState,
        completedSteps: preconditions.completedSteps,
        missingRequirements: preconditions.missingRequirements || failed.map((check) => check.label),
        requirementRows: preconditions.requirementRows || [],
      },
    };
  }

  const owner = preconditions.owner;
  const repo = preconditions.repo;
  const branch = preconditions.branch;
  
  if (!preconditions.job || !preconditions.webhook) {
    console.error("[Auto Deploy] Job or webhook missing after precondition check", {
      jobId: preconditions.job?._id,
      jobName: preconditions.job?.jobName,
      webhookId: preconditions.webhook?._id,
      webhookUrl: preconditions.webhook?.webhookUrl,
    });
    throw new Error("Jenkins job or GitHub webhook not properly detected");
  }

  // Before enabling auto-deploy, verify/create/reuse the webhook on GitHub (idempotent)
  console.log("[Auto Deploy] Verifying GitHub webhook for auto-deploy", {
    owner,
    repo,
    storedHookId: preconditions.webhook.hookId,
    storedWebhookUrl: preconditions.webhook.webhookUrl,
  });

  let verifiedWebhook;
  try {
    const webhookResult = await createGitHubWebhook(userId, {
      owner,
      repo,
      branch,
      webhookUrl: preconditions.webhook.webhookUrl,
    });

    if (!webhookResult.success) {
      console.error("[Auto Deploy] Webhook verification/creation failed", {
        owner,
        repo,
        error: webhookResult.error || webhookResult.message,
      });
      throw new Error(webhookResult.error || webhookResult.message || "Failed to verify/create GitHub webhook");
    }

    verifiedWebhook = webhookResult.webhook;
    console.log("[Auto Deploy] GitHub webhook verified/created successfully", {
      owner,
      repo,
      hookId: verifiedWebhook.hookId,
      webhookUrl: verifiedWebhook.webhookUrl,
      reused: webhookResult.duplicate,
      message: webhookResult.message,
    });
  } catch (webhookError) {
    console.error("[Auto Deploy] Error during webhook verification/creation", {
      owner,
      repo,
      error: webhookError.message,
      stack: webhookError.stack,
    });
    throw webhookError;
  }

  await configureJenkinsJobAutoDeploy(userId, preconditions.job._id || preconditions.job.jobId, true);

  const now = new Date();
  const log = { status: "QUEUED", message: "Auto deploy enabled; waiting for the next GitHub push.", createdAt: now };
  const update = {
    $set: {
      userId,
      enabled: true,
      status: "QUEUED",
      repository: {
        owner,
        name: repo,
        fullName: repositoryFullName(owner, repo),
        branch,
        url: preconditions.job.repository?.url || preconditions.pipeline?.repository?.htmlUrl,
      },
      jenkinsJob: {
        jobId: preconditions.job.jobId,
        jobName: preconditions.job.jobName,
        jobUrl: preconditions.job.jobUrl,
      },
      githubWebhook: {
        hookId: verifiedWebhook.hookId,
        webhookUrl: verifiedWebhook.webhookUrl,
        events: verifiedWebhook.events,
      },
      dockerHub: {
        username: preconditions.dockerHub.username,
      },
      ec2: {
        host: preconditions.ec2.host,
        username: preconditions.ec2.username,
        port: preconditions.pipeline?.deploymentConfig?.ec2?.port,
      },
      workflow: WORKFLOW,
      deploymentId: payload.deploymentId,
      pipelineId: preconditions.pipeline?._id,
      enabledAt: now,
      disabledAt: null,
      updatedAt: now,
    },
    $push: { logs: log },
  };

  const config = await AutoDeploy.findOneAndUpdate(
    { userId, "repository.fullName": repositoryFullName(owner, repo), "repository.branch": branch },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  await updatePipelineAutoDeployStage(userId, { owner, repo, branch, enabled: true });
  await updateDeploymentSetup(userId, { deploymentId: payload.deploymentId, owner, repo, enabled: true });

  emitPipelineStatusUpdate({
    status: "QUEUED",
    stage: "Enable Auto Deploy",
    progress: 100,
    deploymentId: payload.deploymentId,
  });
  broadcastToRoom("pipeline", "auto-deploy:status", toPublicConfig(config, { preconditions: preconditions.checks }));

  console.log("[Auto Deploy] Successfully enabled for:", { owner, repo, branch });

  return {
    success: true,
    message: "Auto Deploy Enabled",
    autoDeploy: toPublicConfig(config, { preconditions: preconditions.checks }),
  };
}

export async function disableAutoDeploy(userId, payload = {}) {
  if (!isDbConnected()) throw new Error("Database not connected");

  const existing = await findAutoDeployConfig(userId, payload);
  if (!existing) throw new Error("Auto deploy configuration not found");

  await configureJenkinsJobAutoDeploy(userId, existing.jenkinsJob.jobId, false);

  const now = new Date();
  const config = await AutoDeploy.findByIdAndUpdate(
    existing._id,
    {
      enabled: false,
      status: "DISABLED",
      disabledAt: now,
      updatedAt: now,
      $push: {
        logs: {
          status: "DISABLED",
          message: "Auto deploy disabled; GitHub pushes will not trigger this Jenkins job.",
          createdAt: now,
        },
      },
    },
    { new: true }
  ).lean();

  await updatePipelineAutoDeployStage(userId, {
    owner: existing.repository.owner,
    repo: existing.repository.name,
    branch: existing.repository.branch,
    enabled: false,
  });
  await updateDeploymentSetup(userId, {
    deploymentId: existing.deploymentId,
    owner: existing.repository.owner,
    repo: existing.repository.name,
    enabled: false,
  });

  broadcastToRoom("pipeline", "auto-deploy:status", toPublicConfig(config));

  return {
    success: true,
    message: "Auto deploy disabled",
    autoDeploy: toPublicConfig(config),
  };
}

export async function getAutoDeployStatus(userId, query = {}) {
  console.log("[Auto Deploy] Status check for:", { userId, query });
  
  const [config, preconditions] = await Promise.all([
    findAutoDeployConfig(userId, query),
    getAutoDeployPreconditions(userId, query).catch((err) => {
      console.error("[Auto Deploy] Preconditions error:", err.message);
      return { checks: [] };
    }),
  ]);

  console.log("[Auto Deploy] Found config:", {
    configExists: Boolean(config),
    configEnabled: config?.enabled,
    preconditionsChecked: preconditions.checks.length,
    allPreconditionsMet: preconditions.checks.every(c => c.ok),
  });

  const latestBuild = config?.jenkinsJob?.jobName
    ? await BuildHistory.findOne({ userId, jobName: config.jenkinsJob.jobName }).sort({ createdAt: -1 }).lean()
    : null;
  const derivedStatus = mapJenkinsBuildToAutoDeployStatus(latestBuild);
  let currentConfig = config;

  if (config && derivedStatus && derivedStatus !== config.status) {
    currentConfig = await AutoDeploy.findByIdAndUpdate(
      config._id,
      {
        status: derivedStatus,
        lastRunAt: latestBuild?.timestamp || new Date(),
        updatedAt: new Date(),
        $push: {
          logs: {
            status: derivedStatus,
            message: `Jenkins build #${latestBuild.buildNumber} is ${derivedStatus}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();
  }

  const latestFromBuild = await ensureDeploymentHistoryFromBuild(userId, currentConfig, latestBuild, derivedStatus);
  const [latestDeployment, deployments] = await Promise.all([
    latestFromBuild || Deployment.findOne({ userId, deploymentType: { $in: ["auto", "rollback"] } }).sort({ createdAt: -1 }).lean(),
    Deployment.find({ userId, deploymentType: { $in: ["auto", "rollback"] } }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const responseData = {
    success: true,
    autoDeploy: toPublicConfig(currentConfig, { preconditions: preconditions.checks }),
    latestDeployment,
    deployments,
    latestBuild,
    statuses: STATUS_ORDER,
    // Add debugging info
    debug: {
      setupStatus: {
        jenkinsJobCreated: preconditions.checks.find(c => c.label === "Jenkins Job Created")?.ok || false,
        githubWebhookConfigured: preconditions.checks.find(c => c.label === "GitHub Webhook Configured")?.ok || false,
        jenkinsfileGenerated: preconditions.checks.find(c => c.label === "Jenkinsfile Generated")?.ok || false,
        jenkinsConnected: preconditions.checks.find(c => c.label === "Jenkins Connected")?.ok || false,
        dockerHubConnected: preconditions.checks.find(c => c.label === "Docker Hub Connected")?.ok || false,
        ec2Connected: preconditions.checks.find(c => c.label === "EC2 Connected")?.ok || false,
      },
      workflowState: preconditions.workflowState || {},
      completedSteps: preconditions.completedSteps || [],
      canEnableAutoDeploy: Boolean(preconditions.canEnableAutoDeploy),
      missingRequirements: preconditions.missingRequirements || preconditions.checks.filter(c => !c.ok).map(c => c.label),
      requirementRows: preconditions.requirementRows || [],
    },
  };

  console.log("[Auto Deploy] Response debug info:", responseData.debug);

  return responseData;
}

export async function getAutoDeployLogs(userId, query = {}) {
  const status = await getAutoDeployStatus(userId, query);
  const deploymentLogs = status.latestDeployment?.logs || [];
  const configLogs = status.autoDeploy?.logs || [];

  return {
    success: true,
    logs: [
      ...configLogs.map((log) => `[${new Date(log.createdAt).toISOString()}] ${log.status}: ${log.message}`),
      ...deploymentLogs,
    ],
  };
}

export { WORKFLOW, STATUS_ORDER };
