import { AWSConnection } from "../models/AWSConnection.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { Deployment } from "../models/Deployment.js";
import { GitHubWebhookConfig } from "../models/GitHubWebhookConfig.js";
import { JenkinsJob } from "../models/JenkinsJob.js";
import { Pipeline } from "../models/Pipeline.js";
import { getDockerHubStatus } from "./dockerHubRegistryService.js";
import { getJenkinsStatus, jenkinsValidationPassed } from "./jenkinsConnectionService.js";

export const PRIMARY_WORKFLOW_STAGES = [
  { key: "REPOSITORY_CONNECTED", field: "repositoryConnected", label: "Connect GitHub Repository" },
  { key: "ANALYZED", field: "analyzed", label: "Analyze Repository" },
  { key: "READINESS_REPORTED", field: "readinessReported", label: "Deployment Readiness Report" },
  { key: "DEPLOYMENT_FILES_GENERATED", field: "deploymentFilesGenerated", label: "Generate Deployment Files" },
  { key: "DOCKER_HUB_CONNECTED", field: "dockerHubConnected", label: "Connect Docker Hub" },
  { key: "JENKINS_CONNECTED", field: "jenkinsConnected", label: "Connect Jenkins" },
  { key: "CICD_GENERATED", field: "cicdGenerated", label: "Generate CI/CD Pipeline" },
  { key: "AUTO_DEPLOY_ENABLED", field: "autoDeployEnabled", label: "Enable Auto Deploy" },
];

export function buildSetupStepsFromSetup(setup = {}) {
  return PRIMARY_WORKFLOW_STAGES.map((stage) => ({
    ...stage,
    status: setup[stage.field] ? "complete" : "pending",
  }));
}

export function getPrimaryStageFromSetup(setup = {}) {
  const firstPending = buildSetupStepsFromSetup(setup).find((step) => step.status !== "complete");
  return firstPending ? firstPending.key : "AUTO_DEPLOY_ENABLED";
}

export function getNextPrimaryActionFromSetup(setup = {}) {
  return buildSetupStepsFromSetup(setup).find((step) => step.status !== "complete")?.key || null;
}

export function buildWorkflowDebug(setup = {}, resources = null) {
  const setupSteps = buildSetupStepsFromSetup(setup);
  const currentStep = getPrimaryStageFromSetup(setup);
  const nextStep = setupSteps.find((step) => step.status !== "complete") || null;
  const completedSteps = setupSteps
    .filter((step) => step.status === "complete")
    .map((step) => step.key);
  const missingPrerequisites = setupSteps
    .filter((step) => step.status !== "complete")
    .map((step) => step.key);

  const blockingCondition = nextStep
    ? null
    : setup.autoDeployEnabled
      ? null
      : "No next workflow step could be determined.";

  return {
    currentStep,
    completedSteps,
    nextStep: nextStep?.key || null,
    missingPrerequisites,
    blockingCondition,
    resources: resources?.actual || {},
  };
}

function repositoryFullName(owner, repo) {
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

function requirement(label, storedValue, validationValue, detail = null) {
  return {
    requirement: label,
    label,
    storedValue: Boolean(storedValue),
    validationValue: Boolean(validationValue),
    finalResult: Boolean(storedValue || validationValue),
    ok: Boolean(storedValue || validationValue),
    detail,
  };
}

function pipelineHasGeneratedJenkinsfile(pipeline) {
  return Boolean(
    pipeline?.generatedWorkflow?.path === "Jenkinsfile" ||
      pipeline?.repository?.workflowPath === "Jenkinsfile" ||
      pipeline?.stages?.some((stage) =>
        ["Generate Jenkins Pipeline", "Generate CI/CD Pipeline"].includes(stage.name) &&
        stage.status === "success"
      )
  );
}

async function findDeploymentForValidation(userId, { deploymentId, owner, repo } = {}) {
  const query = { userId };
  if (deploymentId) {
    query.deploymentId = deploymentId;
  } else if (owner && repo) {
    query.owner = owner;
    query.repository = repo;
  } else {
    return null;
  }

  return Deployment.findOne(query).sort({ updatedAt: -1 }).lean();
}

async function findLatestJenkinsPipeline(userId, { owner, repo, branch } = {}) {
  const query = { userId, provider: "jenkins" };
  if (owner && repo) {
    query["repository.owner"] = owner;
    query["repository.name"] = repo;
  }
  if (branch) query["repository.branch"] = branch;

  return Pipeline.findOne(query).sort({ createdAt: -1 }).lean();
}

async function findActiveJenkinsJob(userId, { owner, repo, branch } = {}) {
  const query = { userId, status: "active" };
  if (owner && repo) {
    query["repository.owner"] = owner;
    query["repository.name"] = repo;
  }
  if (branch) query["repository.branch"] = branch;

  return JenkinsJob.findOne(query).sort({ createdAt: -1 }).lean();
}

async function findAnyActiveJenkinsJob(userId, { owner, repo } = {}) {
  if (!owner || !repo) return null;

  return JenkinsJob.findOne({
    userId,
    status: "active",
    $or: [
      { "repository.owner": owner, "repository.name": repo },
      { jobName: { $regex: `${repo}` } },
    ],
  }).sort({ createdAt: -1 }).lean();
}

async function findActiveWebhook(userId, { owner, repo } = {}) {
  const query = { userId, status: "active" };
  if (owner && repo) query["repository.fullName"] = repositoryFullName(owner, repo);

  return GitHubWebhookConfig.findOne(query).sort({ createdAt: -1 }).lean();
}

async function findAnyActiveWebhook(userId, { owner, repo } = {}) {
  if (!owner || !repo) return null;

  return GitHubWebhookConfig.findOne({
    userId,
    status: "active",
    $or: [
      { "repository.fullName": `${owner}/${repo}` },
      { "repository.owner": owner, "repository.name": repo },
    ],
  }).sort({ createdAt: -1 }).lean();
}

export async function calculateAutoDeployValidationState(userId, query = {}) {
  const deployment = await findDeploymentForValidation(userId, query);
  const owner = query.owner || deployment?.owner;
  const repo = query.repo || deployment?.repository;
  const branch = query.branch || deployment?.branch;

  const [jenkins, dockerHub, resources, pipeline, exactJob, exactWebhook, awsConnection] = await Promise.all([
    getJenkinsStatus(userId),
    getDockerHubStatus(userId),
    calculateActualWorkflowResources(userId),
    findLatestJenkinsPipeline(userId, { owner, repo, branch }),
    findActiveJenkinsJob(userId, { owner, repo, branch }),
    findActiveWebhook(userId, { owner, repo }),
    AWSConnection.findOne({ userId, connected: true }).lean(),
  ]);

  const job = exactJob || await findAnyActiveJenkinsJob(userId, { owner, repo });
  const webhook = exactWebhook || await findAnyActiveWebhook(userId, { owner, repo });
  const setup = deployment?.setup || {};

  const stored = {
    jenkinsConnected: setup.jenkinsConnected,
    jenkinsfileGenerated: setup.cicdGenerated || setup.jenkinsPipelineGenerated || setup.jenkinsfilePath,
    jenkinsJobCreated: setup.jenkinsJobCreated || deployment?.jenkins?.jobId,
    githubWebhookConfigured: setup.githubWebhookConfigured || deployment?.githubWebhook?.hookId,
    dockerHubConnected: setup.dockerHubConnected,
    awsAccountConnected: setup.awsAccountConnected,
  };

  const validation = {
    jenkinsConnected: jenkinsValidationPassed(jenkins.status),
    jenkinsfileGenerated: pipelineHasGeneratedJenkinsfile(pipeline) || deployment?.validation?.hasJenkinsfile,
    jenkinsJobCreated: Boolean(job),
    githubWebhookConfigured: Boolean(webhook),
    dockerHubConnected: Boolean(dockerHub.status?.connected && dockerHub.status?.permissions?.push),
    awsAccountConnected: Boolean(awsConnection && awsConnection.connected),
  };

  const workflowState = {
    deploymentId: deployment?.deploymentId || query.deploymentId || null,
    setup,
    pipelineId: pipeline?._id ? String(pipeline._id) : null,
    jobId: job?._id ? String(job._id) : job?.jobId || null,
    webhookId: webhook?._id ? String(webhook._id) : webhook?.hookId || null,
  };

  const requirementRows = [
    requirement("Jenkins Connected", stored.jenkinsConnected, validation.jenkinsConnected, jenkins.status?.url),
    requirement("Jenkinsfile Generated", stored.jenkinsfileGenerated, validation.jenkinsfileGenerated, pipeline?.generatedWorkflow?.path || setup.jenkinsfilePath),
    requirement("Jenkins Job Created", stored.jenkinsJobCreated, validation.jenkinsJobCreated, job?.jobName),
    requirement("GitHub Webhook Configured", stored.githubWebhookConfigured, validation.githubWebhookConfigured, webhook?.webhookUrl),
    requirement("Docker Hub Connected", stored.dockerHubConnected, validation.dockerHubConnected, dockerHub.status?.username),
    requirement(
      "AWS Account Connected",
      stored.awsAccountConnected,
      validation.awsAccountConnected,
      awsConnection?.accountId || awsConnection?.accessKeyId?.substring(0, 10)
    ),
  ];

  const jenkinsfileComplete = requirementRows.find((row) => row.label === "Jenkinsfile Generated")?.finalResult;
  const blockingRequirements = requirementRows.filter((row) => {
    if (!jenkinsfileComplete && ["Jenkins Job Created", "GitHub Webhook Configured"].includes(row.label)) {
      return false;
    }
    return !row.finalResult;
  });

  const completedSteps = requirementRows.filter((row) => row.finalResult).map((row) => row.label);
  const missingRequirements = blockingRequirements.map((row) => row.label);

  console.log("[Workflow Validation]", {
    workflowState,
    completedSteps,
    missingRequirements,
    requirementRows,
  });

  return {
    owner: owner || pipeline?.repository?.owner || job?.repository?.owner || webhook?.repository?.owner,
    repo: repo || pipeline?.repository?.name || job?.repository?.name || webhook?.repository?.name,
    branch: branch || pipeline?.repository?.branch || job?.repository?.branch || webhook?.repository?.branch || "main",
    deployment,
    pipeline,
    job,
    webhook,
    dockerHub: dockerHub.status,
    awsAccount: awsConnection ? { connected: true, accountId: awsConnection.accountId } : { connected: false },
    jenkins: jenkins.status,
    checks: requirementRows.map(({ label, ok, detail }) => ({ label, ok, detail })),
    requirementRows,
    workflowState,
    completedSteps,
    missingRequirements,
    canEnableAutoDeploy: missingRequirements.length === 0,
  };
}

function fulfilledValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function getRunningInstanceHost(instances = []) {
  const instance = instances.find((item) => item.publicIp || item.elasticIp || item.privateIp);
  return instance?.publicIp || instance?.elasticIp || instance?.privateIp || null;
}

export async function calculateActualWorkflowResources(userId) {
  const [dockerHubResult, jenkinsResult, awsConnectionsResult, runningInstancesResult] =
    await Promise.allSettled([
      getDockerHubStatus(userId),
      getJenkinsStatus(userId),
      AWSConnection.find({ userId, connected: true }).lean(),
      AWSInfrastructure.find({
        userId,
        ec2Status: "running",
        deploymentStatus: { $ne: "terminated" },
      })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

  const dockerHub = fulfilledValue(dockerHubResult, { status: { connected: false } });
  const jenkins = fulfilledValue(jenkinsResult, { status: { connected: false } });
  const awsConnections = fulfilledValue(awsConnectionsResult, []);
  const runningInstances = fulfilledValue(runningInstancesResult, []);

  const dockerHubConnected = Boolean(dockerHub.status?.connected);
  const jenkinsConnected = Boolean(jenkins.status?.connected);
  const awsAccountConnected = Boolean(awsConnections.length > 0);
  // EC2 is automatically provisioned when AWS account is connected
  const ec2AutoProvisioned = awsAccountConnected || runningInstances.length > 0;

  return {
    dockerHub,
    jenkins,
    awsConnections,
    runningInstances,
    actual: {
      dockerHubConnected,
      awsAccountConnected,
      ec2AutoProvisioned,
      jenkinsConnected,
      runningEc2Instances: runningInstances.length,
    },
  };
}

export async function recalculateDeploymentWorkflowState({
  userId,
  deploymentId,
  deployment: providedDeployment = null,
  persist = true,
}) {
  const deployment = providedDeployment || await Deployment.findOne({ userId, deploymentId }).lean();
  if (!deployment) return null;

  const resources = await calculateActualWorkflowResources(userId);
  const repositoryConnected = Boolean(deployment.owner && deployment.repository);
  const repositoryAnalyzed = Boolean(deployment.validation || deployment.setup?.analyzed);
  const setup = {
    ...(deployment.setup || {}),
    repositoryConnected: Boolean(deployment.setup?.repositoryConnected || repositoryConnected),
    analyzed: Boolean(deployment.setup?.analyzed || repositoryAnalyzed),
    readinessReported: Boolean(deployment.setup?.readinessReported || repositoryAnalyzed),
    dockerHubConnected: resources.actual.dockerHubConnected,
    awsAccountConnected: resources.actual.awsAccountConnected,
    ec2AutoProvisioned: resources.actual.ec2AutoProvisioned,
    jenkinsConnected: resources.actual.jenkinsConnected,
    updatedAt: new Date(),
  };

  if (resources.actual.dockerHubConnected) {
    setup.dockerHubUsername = resources.dockerHub.status?.username || setup.dockerHubUsername || "configured";
  }

  if (resources.actual.ec2AutoProvisioned && resources.runningInstances.length > 0) {
    setup.ec2InstanceId = resources.runningInstances[0]?.instanceId || setup.ec2InstanceId || "auto-provisioned";
    setup.ec2PublicIp = getRunningInstanceHost(resources.runningInstances) || setup.ec2PublicIp || "running";
  }

  if (resources.actual.jenkinsConnected) {
    setup.jenkinsUrl = resources.jenkins.status?.url || setup.jenkinsUrl || "configured";
    setup.jenkinsUser =
      resources.jenkins.status?.connectedUser ||
      resources.jenkins.status?.username ||
      setup.jenkinsUser ||
      "configured";
  }

  let recalculatedDeployment = {
    ...deployment,
    setup,
  };

  if (persist) {
    const set = {
      "setup.repositoryConnected": setup.repositoryConnected,
      "setup.analyzed": setup.analyzed,
      "setup.readinessReported": setup.readinessReported,
      "setup.dockerHubConnected": setup.dockerHubConnected,
      "setup.awsAccountConnected": setup.awsAccountConnected,
      "setup.ec2AutoProvisioned": setup.ec2AutoProvisioned,
      "setup.jenkinsConnected": setup.jenkinsConnected,
      "setup.updatedAt": setup.updatedAt,
      updatedAt: new Date(),
    };

    if (setup.dockerHubUsername) set["setup.dockerHubUsername"] = setup.dockerHubUsername;
    if (setup.ec2InstanceId) set["setup.ec2InstanceId"] = setup.ec2InstanceId;
    if (setup.ec2PublicIp) set["setup.ec2PublicIp"] = setup.ec2PublicIp;
    if (setup.jenkinsUrl) set["setup.jenkinsUrl"] = setup.jenkinsUrl;
    if (setup.jenkinsUser) set["setup.jenkinsUser"] = setup.jenkinsUser;

    const updated = await Deployment.findOneAndUpdate(
      { userId, deploymentId: deployment.deploymentId },
      { $set: set },
      { new: true }
    ).lean();

    if (updated) recalculatedDeployment = updated;
  }

  const debug = buildWorkflowDebug(recalculatedDeployment.setup || setup, resources);
  console.log("[Workflow Recalculate]", {
    deploymentId: deployment.deploymentId,
    userId,
    currentStep: debug.currentStep,
    completedSteps: debug.completedSteps,
    nextStep: debug.nextStep,
    missingPrerequisites: debug.missingPrerequisites,
    blockingCondition: debug.blockingCondition,
    actualResources: resources.actual,
  });

  return {
    success: true,
    deployment: recalculatedDeployment,
    setup: recalculatedDeployment.setup || setup,
    setupSteps: buildSetupStepsFromSetup(recalculatedDeployment.setup || setup),
    currentStep: getPrimaryStageFromSetup(recalculatedDeployment.setup || setup),
    debug,
    nextActions: getNextPrimaryActionFromSetup(recalculatedDeployment.setup || setup)
      ? [getNextPrimaryActionFromSetup(recalculatedDeployment.setup || setup)]
      : [],
    resources,
  };
}
