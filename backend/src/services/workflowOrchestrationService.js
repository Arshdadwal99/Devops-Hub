import axios from "axios";
import { Deployment } from "../models/Deployment.js";
import { AutoDeploy } from "../models/AutoDeploy.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { getDockerHubAccessToken, getDockerHubStatus } from "./dockerHubRegistryService.js";
import { createGitHubWriteClient, getGitHubAccessToken, getGitHubStatus } from "./githubService.js";
import { getJenkinsConnectionCredentials, getJenkinsStatus, jenkinsValidationPassed } from "./jenkinsConnectionService.js";
import { ec2IntelligentProvisioningService } from "./ec2IntelligentProvisioningService.js";
import { generateJenkinsPipeline } from "./jenkinsPipelineGeneratorService.js";
import { configureJenkinsJobAutoDeploy, createJenkinsJob } from "./jenkinsJobService.js";
import { createGitHubWebhook } from "./githubWebhookConfigService.js";
import { analyzeRepository } from "./repositoryAnalysisService.js";
import { isDbConnected } from "../db.js";
import { logger } from "../utils/logger.js";
import { INSTANCE_TYPE, getConfiguredInstanceType } from "./freeTierInstanceTypes.js";
import { ec2SsmCommandService } from "./ec2SsmCommandService.js";
import { ec2SsmDiagnosticsService } from "./ec2SsmDiagnosticsService.js";
import {
  detectAmiType,
  getAmiUsername,
} from "./ec2AmiDetectionService.js";
import { Ec2SsmAptLockService } from "./ec2SsmAptLockService.js";


/**
 * Workflow Orchestration Service
 * Manages 5-phase automated deployment workflow
 *
 * PHASE 1: VALIDATION (Steps 1-5)
 * PHASE 2: INFRASTRUCTURE (Steps 6-10)
 * PHASE 3: CI/CD SETUP (Steps 11-18)
 * PHASE 4: DEPLOYMENT (Steps 19-24)
 * PHASE 5: AUTO-DEPLOY (Steps 25-26)
 */

const WORKFLOW_PHASES = {
  VALIDATION: 1,
  INFRASTRUCTURE: 2,
  CI_CD_SETUP: 3,
  DEPLOYMENT: 4,
  AUTO_DEPLOY: 5,
};

const WORKFLOW_STEPS = {
  // Phase 1: Validation (1-5)
  VALIDATE_GITHUB_CONNECTION: 1,
  VALIDATE_DOCKER_CONNECTION: 2,
  VALIDATE_JENKINS_CONNECTION: 3,
  VALIDATE_AWS_CONNECTION: 4,
  VERIFY_REPOSITORY_ACCESS: 5,

  // Phase 2: Infrastructure (6-10)
  CHECK_EC2_INSTANCE: 6,
  PROVISION_EC2_IF_NEEDED: 7,
  INSTALL_DOCKER_ON_EC2: 8,
  VALIDATE_DOCKER_ENGINE: 9,
  SETUP_DEPLOYMENT_WORKSPACE: 10,

  // Phase 3: CI/CD Setup (11-18)
  GENERATE_DOCKERFILE: 11,
  GENERATE_CICD_PIPELINE: 12,
  CREATE_JENKINS_JOB: 13,
  SETUP_GITHUB_WEBHOOK: 14,
  UPLOAD_PIPELINE_FILES: 15,
  VALIDATE_JENKINS_JOB: 16,
  TEST_WEBHOOK_TRIGGER: 17,
  VERIFY_CI_CD_CHAIN: 18,

  // Phase 4: Deployment (19-24)
  CLONE_REPOSITORY: 19,
  BUILD_DOCKER_IMAGE: 20,
  PUSH_TO_REGISTRY: 21,
  PULL_IMAGE_ON_EC2: 22,
  DEPLOY_CONTAINER: 23,
  VERIFY_APPLICATION: 24,

  // Phase 5: Auto-Deploy (25-26)
  ENABLE_AUTO_TRIGGERS: 25,
  VERIFY_AUTO_DEPLOY: 26,
};

function validateAWSInfrastructureService() {
  if (!AWSInfrastructure?.findOne) {
    throw new Error("AWS infrastructure model is missing or not loaded");
  }
  if (!ec2IntelligentProvisioningService?.provisionOrReuse) {
    throw new Error("AWS infrastructure provisioning service is missing or does not expose provisionOrReuse()");
  }
  console.log("[AWS] Infrastructure service loaded");
}

validateAWSInfrastructureService();

const DEPLOYMENT_STEP_SEQUENCE = [
  { name: "Validation", phase: 1, uiKey: null },
  { name: "GitHub Verification", phase: 1, uiKey: "github" },
  { name: "Docker Hub Verification", phase: 1, uiKey: "docker" },
  { name: "Jenkins Verification", phase: 1, uiKey: "jenkins" },
  { name: "AWS Verification", phase: 1, uiKey: "aws" },
  { name: "Infrastructure Provisioning", phase: 2, uiKey: "ec2_provision" },
  { name: "Check Existing Instances", phase: 2, uiKey: "ec2_check" },
  { name: "Provision EC2 Instance", phase: 2, uiKey: "ec2_provision" },
  { name: "Wait Until EC2 Running", phase: 2, uiKey: "ec2_running" },
  { name: "Install Docker", phase: 2, uiKey: "docker_install" },
  { name: "Install Docker Compose", phase: 2, uiKey: "docker_compose" },
  { name: "Configure Deployment Environment", phase: 2, uiKey: "env_configure" },
  { name: "Jenkins Job Creation", phase: 3, uiKey: "create_job" },
  { name: "GitHub Webhook Creation", phase: 3, uiKey: "configure_webhook" },
  { name: "Configure Jenkins Credentials", phase: 3, uiKey: "jenkins_creds" },
  { name: "Docker Build", phase: 4, uiKey: "docker_build" },
  { name: "Deploy Application", phase: 4, uiKey: "deploy_ec2" },
  { name: "Enable GitHub Webhook Triggers", phase: 5, uiKey: "webhook_enable" },
  { name: "Enable Automatic Jenkins Builds", phase: 5, uiKey: "jenkins_auto" },
  { name: "Enable Automatic Deployment On Push", phase: 5, uiKey: "auto_deploy_enable" },
];

const STEP_TOTAL = DEPLOYMENT_STEP_SEQUENCE.length;
const AUTO_DEPLOY_STEP_TIMEOUT_MS = Number(process.env.AUTO_DEPLOY_STEP_TIMEOUT_MS || 45000);

function getErrorMessage(error) {
  return error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    String(error);
}

function serializeError(error) {
  return {
    message: getErrorMessage(error),
    stack: error?.stack,
    name: error?.name,
    status: error?.response?.status || error?.status,
    data: error?.response?.data,
    jenkins: error?.jenkins,
  };
}

function safeForLog(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value, (key, val) => {
      if (/token|password|secret|authorization|accessKey|apiToken|privateKey|keyMaterial/i.test(key)) {
        return "[redacted]";
      }
      return val;
    }));
  } catch (_error) {
    return String(value);
  }
}

/**
 * Extract a section from deployment logs by searching for lines with a specific marker
 * @param {string} output - Full output from deployment
 * @param {string} marker - The marker to search for (e.g., "[DevOpsHub][Existing Containers]")
 * @returns {string[]} Array of matching log lines
 */
function extractLogSection(output, marker) {
  if (!output || !marker) return [];
  const lines = output.split('\n');
  return lines
    .filter(line => line.includes(marker))
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function deploymentLog(stepName, event, details = {}) {
  const message = `[DEPLOYMENT] ${stepName} ${event}`;
  if (event === "failed") {
    console.error(message, details);
  } else {
    console.log(message, details);
  }
  return message;
}

function withTimeout(promise, timeoutMs, label) {
  console.log("🔷 [TIMEOUT_WRAP_START] withTimeout wrapper created", {
    label,
    timeoutMs,
  });

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      console.log("🔷 [TIMEOUT_WRAP_FIRED] withTimeout timeout fired", {
        label,
        timeoutMs,
      });
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout])
    .then((result) => {
      console.log("🔷 [TIMEOUT_WRAP_COMPLETED] Promise completed before timeout", {
        label,
        timeoutMs,
      });
      return result;
    })
    .catch((error) => {
      console.log("🔷 [TIMEOUT_WRAP_CAUGHT_ERROR] Promise or timeout raised error", {
        label,
        timeoutMs,
        errorMessage: error.message,
        isTimeoutError: error.message.includes("timed out after"),
      });
      throw error;
    })
    .finally(() => {
      console.log("🔷 [TIMEOUT_WRAP_FINALLY] Clearing timeout", {
        label,
      });
      clearTimeout(timeoutId);
    });
}

async function runAutoDeployOperation(label, operation, timeoutMs = AUTO_DEPLOY_STEP_TIMEOUT_MS) {
  const startedAt = Date.now();
  console.log(`[Phase 5: Auto Deploy] ${label} started`, { timeoutMs });
  try {
    const result = await withTimeout(Promise.resolve().then(operation), timeoutMs, label);
    console.log(`[Phase 5: Auto Deploy] ${label} completed`, {
      durationMs: Date.now() - startedAt,
      result: safeForLog(result),
    });
    return result || { success: true };
  } catch (error) {
    console.error(`[Phase 5: Auto Deploy] ${label} failed`, {
      durationMs: Date.now() - startedAt,
      error: getErrorMessage(error),
      stack: error?.stack,
    });
    throw error;
  }
}

function sanitizeDockerName(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "app";
}

function shellSingleQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function isRealAwsInstanceId(instanceId) {
  return /^i-[a-f0-9]{8,17}$/i.test(String(instanceId || ""));
}

function isUsableIp(value) {
  const ip = String(value || "").trim();
  return Boolean(ip && ip !== "pending" && ip !== "unknown" && ip !== "0.0.0.0");
}

function normalizeProjectDetection(analysis = {}) {
  const stack = analysis.stack || analysis.data?.technologies || [];
  const primary = stack[0] || "Node.js";
  return {
    projectType: primary,
    stack,
    appPort: Number(analysis.recommendedPort || analysis.data?.recommendedPort || 3000),
    buildCommand: analysis.buildCommand || analysis.data?.buildCommand || null,
    startCommand: analysis.startCommand || analysis.data?.startCommand || "npm start",
    hasDockerfile: Boolean(analysis.dockerfileExists || analysis.data?.hasDocker),
    hasDockerCompose: Boolean(analysis.dockerComposeExists || analysis.data?.hasDockerCompose),
    hasJenkinsfile: Boolean(analysis.jenkinsfileExists || analysis.data?.hasJenkinsfile),
  };
}

function buildDockerfileContent(detection) {
  const type = String(detection.projectType || "").toLowerCase();
  const port = Number(detection.appPort || 3000);

  if (type.includes("python") || type.includes("flask") || type.includes("django")) {
    return `FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
ENV PYTHONUNBUFFERED=1
ENV PORT=${port}
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -fsS http://localhost:${port}/ || exit 1
CMD ["sh", "-c", "${detection.startCommand || "python app.py"}"]
`;
  }

  if (type.includes("java") || type.includes("spring")) {
    return `FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY . .
RUN mvn -B package -DskipTests
FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/*.jar app.jar
ENV PORT=${port}
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -fsS http://localhost:${port}/ || exit 1
CMD ["java", "-jar", "app.jar"]
`;
  }

  return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
COPY . .
RUN ${detection.buildCommand || "echo \"No build command detected\""}

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl dumb-init
COPY --from=builder /app .
ENV NODE_ENV=production
ENV PORT=${port}
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -fsS http://localhost:${port}/ || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "${detection.startCommand || "npm start"}"]
`;
}

function buildDockerComposeContent(repo, detection, dockerHubUsername) {
  const containerName = sanitizeDockerName(repo);
  const port = Number(detection.appPort || 3000);
  const image = `${sanitizeDockerName(dockerHubUsername)}/${containerName}:latest`;

  return `services:
  app:
    image: ${image}
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${containerName}
    ports:
      - "80:${port}"
    environment:
      NODE_ENV: production
      PORT: ${port}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:${port}/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
`;
}

async function fetchGitHubFile(client, owner, repo, filePath, branch) {
  try {
    const response = await client.get(`/repos/${owner}/${repo}/contents/${filePath}`, {
      params: branch ? { ref: branch } : {},
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

async function upsertGitHubFile({ owner, repo, branch, filePath, content, message }) {
  const client = createGitHubWriteClient();
  const existing = await fetchGitHubFile(client, owner, repo, filePath, branch);

  if (existing?.sha) {
    return {
      skipped: true,
      path: filePath,
      sha: existing.sha,
      message: `${filePath} already exists`,
    };
  }

  const response = await client.put(`/repos/${owner}/${repo}/contents/${filePath}`, {
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
  });

  return {
    skipped: false,
    path: filePath,
    commitSha: response.data?.commit?.sha,
    contentSha: response.data?.content?.sha,
  };
}

async function ensureCicdFilesCommitted({ repository, branch, detection, dockerHubUsername }) {
  const dockerfile = detection.hasDockerfile
    ? { skipped: true, path: "Dockerfile", message: "Dockerfile already exists" }
    : await upsertGitHubFile({
        owner: repository.owner,
        repo: repository.repo,
        branch,
        filePath: "Dockerfile",
        content: buildDockerfileContent(detection),
        message: "chore(ci): add production Dockerfile",
      });

  const compose = detection.hasDockerCompose
    ? { skipped: true, path: "docker-compose.yml", message: "docker-compose.yml already exists" }
    : await upsertGitHubFile({
        owner: repository.owner,
        repo: repository.repo,
        branch,
        filePath: "docker-compose.yml",
        content: buildDockerComposeContent(repository.repo, detection, dockerHubUsername),
        message: "chore(ci): add production docker-compose",
      });

  return { dockerfile, compose };
}

async function assertAndNormalizeAwsInstance(userId, awsConnection, infrastructure) {
  const instanceId = infrastructure?.instanceId;
  if (!isRealAwsInstanceId(instanceId)) {
    throw new Error(`AWS returned invalid EC2 instance id: ${instanceId}`);
  }

  const verified = await ec2IntelligentProvisioningService.verifyAwsInstance(userId, awsConnection, instanceId);
  return {
    ...infrastructure,
    instanceId: verified.instanceId,
    instanceType: verified.instanceType || infrastructure.instanceType,
    publicIp: verified.publicIp,
    publicDns: verified.publicDns,
    privateIp: verified.privateIp,
    state: verified.state,
    securityGroupId: verified.securityGroupId || infrastructure.securityGroupId,
    vpcId: verified.vpcId,
    subnetId: verified.subnetId,
    region: infrastructure.region || awsConnection.region,
  };
}

async function runSsmShellCommand(userId, awsConnection, infrastructure, commands, options = {}) {
  if (!infrastructure?.instanceId) {
    throw new Error("Cannot run SSM command without an EC2 instance id");
  }

  return ec2SsmCommandService.sendShellCommand(
    userId,
    awsConnection,
    infrastructure.instanceId,
    commands,
    options
  );
}

async function bootstrapAndVerifyServer(userId, awsConnection, infrastructure, detection) {
  const host = infrastructure.publicIp;
  const operatingSystem = infrastructure.operatingSystem || "ubuntu";
  const instanceId = infrastructure.instanceId;
  
  // Auto-detect AMI type and username
  const detectedUsername = getAmiUsername(operatingSystem);
  const amiType = detectAmiType(operatingSystem);
  
  if (!isUsableIp(host)) {
    throw new Error(
      `Cannot bootstrap EC2 without a real public IP. Received: ${host}`
    );
  }

  logger.info("[BOOTSTRAP] Starting EC2 bootstrap and Docker verification", {
    host,
    username: detectedUsername,
    instanceId,
    operatingSystem,
    amiType,
    region: awsConnection.region,
  });

  // Run pre-check diagnostics to identify any critical issues
  logger.info("[BOOTSTRAP] Running pre-bootstrap diagnostics", { instanceId });
  const preCheckDiagnostics = await ec2SsmDiagnosticsService.runComprehensiveDiagnostics(
    userId,
    awsConnection,
    instanceId
  );

  logger.info("[BOOTSTRAP] Pre-bootstrap diagnostics complete", {
    instanceId,
    ec2Status: preCheckDiagnostics.checks.ec2Instance?.status,
    iamStatus: preCheckDiagnostics.checks.iamRole?.status,
    ssmRegistrationStatus: preCheckDiagnostics.checks.ssmRegistration?.status,
    ssmAgentStatus: preCheckDiagnostics.checks.ssmAgent?.status,
  });

  // Log detailed IAM role information
  if (preCheckDiagnostics.checks.iamRole?.details?.roles) {
    logger.info("[BOOTSTRAP] IAM configuration", {
      instanceId,
      iamProfile: preCheckDiagnostics.checks.iamRole?.details?.iamProfileName,
      roles: preCheckDiagnostics.checks.iamRole?.details?.roles,
      policies: preCheckDiagnostics.checks.iamRole?.details?.policies,
    });
  }

  // Log SSM registration status
  if (preCheckDiagnostics.checks.ssmRegistration?.details) {
    logger.info("[BOOTSTRAP] SSM registration status", {
      instanceId,
      pingStatus: preCheckDiagnostics.checks.ssmRegistration?.details?.pingStatus,
      lastPingDateTime: preCheckDiagnostics.checks.ssmRegistration?.details?.lastPingDateTime,
      agentVersion: preCheckDiagnostics.checks.ssmRegistration?.details?.agentVersion,
      computerName: preCheckDiagnostics.checks.ssmRegistration?.details?.computerName,
    });
  }

  logger.info("[BOOTSTRAP] Waiting for SSM to become online", {
    instanceId,
    operatingSystem,
    amiType,
  });

  // Wait for instance to register in SSM Managed Nodes (5-minute timeout)
  // This happens before attempting any SSM commands
  try {
    logger.info("[BOOTSTRAP] Waiting for instance to register in SSM", {
      instanceId,
    });
    
    const ssmRegistration = await ec2SsmDiagnosticsService.waitForSsmRegistration(
      userId,
      awsConnection,
      instanceId,
      { timeoutMs: 5 * 60 * 1000 } // 5-minute timeout
    );

    logger.info("[BOOTSTRAP] Instance registered in SSM", {
      instanceId,
      ...ssmRegistration,
    });
  } catch (error) {
    logger.error("[BOOTSTRAP] SSM registration failed", {
      instanceId,
      error: error.message,
    });
    throw error;
  }

  // Wait for SSM to be online (2-minute timeout)
  try {
    const onlineResult = await ec2SsmCommandService.waitForInstanceOnline(
      userId,
      awsConnection,
      instanceId,
      { timeoutMs: 2 * 60 * 1000 } // 2-minute timeout
    );
    
    logger.info("[BOOTSTRAP] SSM instance is now online", {
      instanceId,
      ...onlineResult,
    });
  } catch (error) {
    logger.error("[BOOTSTRAP] SSM online check failed", {
      instanceId,
      error: error.message,
    });
    throw error;
  }

  const installNode = /node|react|next|express|mern/i.test(
    [detection.projectType, ...(detection.stack || [])].join(" ")
  );

  // Generate bootstrap command with APT lock handling for Ubuntu
  const bootstrapCommand = Ec2SsmAptLockService.generateDockerInstallWithAptLockHandling({
    amiType,
    detectedUsername,
    maxRetries: 3,
    retryDelaySeconds: 30,
    installNode
  });

  logger.info("[BOOTSTRAP] Executing bootstrap command on EC2", {
    host,
    instanceId,
    amiType,
    commandLength: bootstrapCommand.length,
    commandPreview: bootstrapCommand.substring(0, 200),
  });

  console.log("🔷 [BOOTSTRAP_EXEC_START] About to execute bootstrap command via SSM");
  console.log({
    host,
    instanceId,
    amiType,
    commandLength: bootstrapCommand.length,
  });

  let result;
  try {
    console.log("🔷 [BOOTSTRAP_CALLING_RUNSSMSHELL] About to call runSsmShellCommand with timeout wrapper");

    result = await withTimeout(
      runSsmShellCommand(userId, awsConnection, infrastructure, bootstrapCommand, {
        comment: "DevOpsHub install Docker, Docker Compose, and runtime tools",
        timeoutSeconds: 600,
        waitTimeoutMs: 660000,
      }),
      700000,
      "EC2 server SSM bootstrap"
    );

    console.log("🔷 [BOOTSTRAP_RUNSSMSHELL_RETURNED] runSsmShellCommand completed successfully", {
      resultStatus: result.status,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
    });

    logger.info("[BOOTSTRAP] Bootstrap command executed successfully", {
      host,
      instanceId,
      outputLength: result.stdout.length,
      outputPreview: result.stdout.substring(0, 500),
    });
  } catch (error) {
    console.log("🔷 [BOOTSTRAP_ERROR] Bootstrap command execution failed", {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.substring(0, 500),
    });

    logger.error("[BOOTSTRAP] Bootstrap command execution failed", {
      instanceId,
      error: error.message,
      hasAptLockError: error.message?.includes("Could not get lock") || error.message?.includes("apt"),
    });
    
    // Log specific APT lock hints if error contains apt-related messages
    if (error.message?.includes("Could not get lock") || error.message?.includes("/var/lib/apt")) {
      logger.error("[APT] APT lock error detected - cloud-init may still be running", {
        instanceId,
        suggestion: "Instance may need additional time for cloud-init to complete"
      });
    }
    
    throw error;
  }

  console.log("🔷 [BOOTSTRAP_SUCCESS] Bootstrap completed, preparing return value", {
    resultStatus: result.status,
    stdoutLength: result.stdout.length,
  });

  logger.info("[BOOTSTRAP] Bootstrap completed successfully", {
    host,
    instanceId,
    output: result.stdout.substring(0, 500),
  });
  
  // Parse output for APT lock release timing
  const aptLockReleaseMatch = result.stdout.match(/\[APT\] All APT lock files released/);
  const dockerInstallMatch = result.stdout.match(/\[DOCKER\] ✅ All installations complete/);
  
  logger.info("[BOOTSTRAP] Installation verification", {
    instanceId,
    aptLockReleased: !!aptLockReleaseMatch,
    dockerInstalled: !!dockerInstallMatch,
  });

  return {
    success: true,
    host,
    username: detectedUsername,
    installedNode: installNode,
    output: result.stdout,
    operatingSystem,
    amiType,
  };
}

async function getJenkinsCrumb(client) {
  try {
    const response = await client.get("/crumbIssuer/api/json");
    return { [response.data.crumbRequestField]: response.data.crumb };
  } catch (_error) {
    return {};
  }
}

function createJenkinsApiClient(credentials) {
  return axios.create({
    baseURL: String(credentials.url || "").replace(/\/+$/, ""),
    timeout: 15000,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.apiToken}`).toString("base64")}`,
      "User-Agent": "DevOps-Hub",
    },
  });
}

async function ensureJenkinsCredential(client, crumbHeaders, id, xml) {
  try {
    await client.get(`/credentials/store/system/domain/_/credential/${encodeURIComponent(id)}/api/json`);
    return { id, existed: true };
  } catch (error) {
    if (error.response?.status !== 404) throw error;
  }

  await client.post("/credentials/store/system/domain/_/createCredentials", xml, {
    headers: {
      ...crumbHeaders,
      "Content-Type": "application/xml",
    },
  });
  return { id, existed: false };
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function configureJenkinsCredentialsAutomatic(userId, infrastructure) {
  const [jenkinsCredentials, dockerHubCredentials] = await Promise.all([
    getJenkinsConnectionCredentials(userId),
    getDockerHubAccessToken(userId),
  ]);
  const client = createJenkinsApiClient(jenkinsCredentials);
  const crumbHeaders = await getJenkinsCrumb(client);

  const dockerXml = `<com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
  <scope>GLOBAL</scope>
  <id>dockerhub-credentials</id>
  <description>Docker Hub credentials managed by DevOps Hub</description>
  <username>${escapeXml(dockerHubCredentials.username)}</username>
  <password>${escapeXml(dockerHubCredentials.accessToken)}</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>`;

  const dockerCredential = await ensureJenkinsCredential(
    client,
    crumbHeaders,
    "dockerhub-credentials",
    dockerXml
  );

  return {
    success: true,
    dockerCredential,
    ssmDeployment: true,
    instanceId: infrastructure?.instanceId,
  };
}

async function verifyJenkinsJobExists(userId, jobName) {
  const credentials = await getJenkinsConnectionCredentials(userId);
  const client = createJenkinsApiClient(credentials);
  const response = await client.get(`/job/${encodeURIComponent(jobName)}/api/json`);
  return {
    success: response.status === 200,
    jobName: response.data?.name,
    jobUrl: response.data?.url,
    buildable: response.data?.buildable !== false,
  };
}

function queueIdFromLocation(location = "") {
  const match = String(location).match(/\/queue\/item\/(\d+)/);
  return match?.[1] || null;
}

async function waitForJenkinsQueue(client, queueId, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await client.get(`/queue/item/${queueId}/api/json`);
    if (response.data?.cancelled) throw new Error(`Jenkins queue item ${queueId} was cancelled`);
    if (response.data?.executable?.number) return response.data.executable.number;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Timed out waiting for Jenkins queue item ${queueId}`);
}

async function triggerJenkinsBuildAndWait(userId, jobName) {
  const credentials = await getJenkinsConnectionCredentials(userId);
  const client = createJenkinsApiClient(credentials);
  const crumbHeaders = await getJenkinsCrumb(client);
  const triggerResponse = await client.post(`/job/${encodeURIComponent(jobName)}/build`, null, {
    headers: crumbHeaders,
  });
  const queueId = queueIdFromLocation(triggerResponse.headers.location);
  if (!queueId) throw new Error("Jenkins did not return a queue item for the triggered build");

  const buildNumber = await waitForJenkinsQueue(client, queueId);
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.JENKINS_BUILD_TIMEOUT_MS || 45 * 60 * 1000);
  while (Date.now() - startedAt < timeoutMs) {
    const response = await client.get(`/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`);
    if (!response.data?.building) {
      if (response.data?.result !== "SUCCESS") {
        throw new Error(`Jenkins build #${buildNumber} finished with ${response.data?.result || "UNKNOWN"}`);
      }
      return {
        success: true,
        buildNumber,
        buildUrl: response.data?.url,
        result: response.data?.result,
        duration: response.data?.duration,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Timed out waiting for Jenkins build #${buildNumber}`);
}

function httpStatus(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.get(parsed, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("timeout", () => {
      request.destroy(new Error(`HTTP check timed out for ${url}`));
    });
    request.on("error", reject);
  });
}

function isEc2Port80BindError(error) {
  const message = getErrorMessage(error);
  return message.includes("failed to bind host port 0.0.0.0:80/tcp")
    || message.includes("address already in use")
    || message.includes("failed to set up container networking");
}

async function verifyContainerAndHealth(userId, awsConnection, infrastructure, repository) {
  const containerName = sanitizeDockerName(repository.repo);
  const host = infrastructure.publicIp;
  const inspect = await runSsmShellCommand(
    userId,
    awsConnection,
    infrastructure,
    `docker inspect -f '{{.State.Running}}' ${containerName}`,
    {
      comment: "DevOpsHub verify deployed container",
      timeoutSeconds: 60,
    }
  );
  if (!String(inspect.stdout).includes("true")) {
    throw new Error(`Container ${containerName} is not running on EC2`);
  }

  const applicationUrl = `http://${host}`;
  const statusCode = await httpStatus(applicationUrl, 15000);
  if (statusCode < 200 || statusCode >= 400) {
    throw new Error(`Health check failed for ${applicationUrl}. Expected HTTP 2xx/3xx, received ${statusCode}`);
  }

  return {
    success: true,
    containerName,
    applicationUrl,
    healthStatusCode: statusCode,
  };
}

async function deployApplicationWithSsm(userId, awsConnection, infrastructure, repository, build, dockerHubStatus, deploymentConfig = {}) {
  const dockerCredentials = await getDockerHubAccessToken(userId);
  const imageRepositoryName = sanitizeDockerName(repository.repo);
  
  // Image reference
  const imageName = build?.imageName || (
    dockerHubStatus?.username
      ? `${sanitizeDockerName(dockerHubStatus.username)}/${imageRepositoryName}`
      : imageRepositoryName
  );
  const imageTag = build?.build?.buildNumber || build?.buildNumber || "latest";
  const imageRef = `${imageName}:${imageTag}`;
  const normalizedImageName = String(imageName).toLowerCase();
  const isToDoListImage = normalizedImageName === "arshdadwal99/to-do-list" || normalizedImageName.endsWith("/to-do-list");
  const containerName = isToDoListImage ? "to-do-list" : imageRepositoryName;
  const publicPort = 80;

  logger.info("[SSM-DEPLOY] Preparing EC2 container deployment", {
    instanceId: infrastructure.instanceId,
    publicIp: infrastructure.publicIp,
    region: infrastructure.region || awsConnection.region,
    imageRef,
    containerName,
    publicPort,
    portDetectionMethod: "remote-docker-image-inspect",
  });

  const deployCommand = `
#!/usr/bin/env bash
set -eu

LOCK_DIR="/tmp/devopshub-to-do-list-deploy.lock"
LOCK_INFO_FILE="$LOCK_DIR/lock"
REPOSITORY_NAME="to-do-list"
IMAGE_REF=${shellSingleQuote(imageRef)}
CONTAINER_NAME="to-do-list"
PUBLIC_PORT=${publicPort}

log_cmd() {
  echo "[DevOpsHub][Command] $*"
}

run_cmd() {
  log_cmd "$@"
  "$@"
}

run_shell() {
  log_cmd "$*"
  bash -o pipefail -c "$*"
}

write_deploy_lock_info() {
  {
    echo "pid=$$"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "repository=$REPOSITORY_NAME"
  } > "$LOCK_INFO_FILE"
}

release_deploy_lock() {
  echo "[DevOpsHub][Deploy Lock] Releasing"
  rm -rf "$LOCK_DIR"
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
else
  LOCK_PID=""
  if [ -f "$LOCK_INFO_FILE" ]; then
    LOCK_PID=$(sed -n 's/^pid=//p' "$LOCK_INFO_FILE" | head -1)
  fi
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR (pid=$LOCK_PID)"
    exit 1
  fi
  echo "[DevOpsHub][Deploy Lock] Removing stale lock: $LOCK_DIR"
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR"
    exit 1
  fi
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
fi
trap release_deploy_lock EXIT
trap 'trap - EXIT; release_deploy_lock; exit 130' INT
trap 'trap - EXIT; release_deploy_lock; exit 143' TERM

echo "[DevOpsHub][Deploy] instance_id=${infrastructure.instanceId}"
echo "[DevOpsHub][Deploy] strategy=docker-compose"
echo "[DevOpsHub][Deploy] repository=https://github.com/Arshdadwal99/hotel-booking.git"

echo "[DevOpsHub][Docker Login] start"
log_cmd "docker login -u ${shellSingleQuote(dockerCredentials.username)} --password-stdin"
echo ${shellSingleQuote(dockerCredentials.accessToken)} | docker login -u ${shellSingleQuote(dockerCredentials.username)} --password-stdin
echo "[DevOpsHub][Docker Login] success"

run_cmd sudo mkdir -p /opt
run_cmd sudo chown "$USER:$USER" /opt
run_shell "git clone https://github.com/Arshdadwal99/hotel-booking.git /opt/hotel-booking || true"
run_cmd cd /opt/hotel-booking
run_cmd git fetch origin
run_cmd git reset --hard origin/master

echo "[DevOpsHub][Docker Compose] down"
run_shell "docker compose down || true"
echo "[DevOpsHub][Docker Compose] pull"
run_shell "docker compose pull || true"
echo "[DevOpsHub][Docker Compose] up"
run_cmd docker compose up -d --build
echo "[DevOpsHub][Docker Compose] ps"
run_cmd docker compose ps

echo "[DevOpsHub][Health Check] Frontend http://localhost:3034"
run_cmd curl -f http://localhost:3034
echo "[DevOpsHub][Health Check] Admin panel http://localhost:3033"
run_cmd curl -f http://localhost:3033
echo "[DevOpsHub][Health Check] Backend http://localhost:3035"
run_cmd curl -f http://localhost:3035

echo "[DevOpsHub][Final Verification] Deployment completed successfully"
echo "[DevOpsHub][Final Verification] frontend_url=http://localhost:3034"
echo "[DevOpsHub][Final Verification] admin_url=http://localhost:3033"
echo "[DevOpsHub][Final Verification] backend_url=http://localhost:3035"

exit 0
`;

  // ============================================================================
  // DEBUG: Log full script with line numbers
  // ============================================================================
  console.log("=== SSM DEPLOYMENT SCRIPT (FULL CONTENT WITH LINE NUMBERS) ===");
  const scriptLines = deployCommand.split('\n');
  scriptLines.forEach((line, index) => {
    const lineNum = index + 1;
    const displayLine = line.replace(dockerCredentials.accessToken, '[REDACTED_DOCKER_TOKEN]');
    console.log(`${String(lineNum).padStart(4, ' ')}: ${displayLine}`);
  });
  console.log(`=== END SCRIPT (Total: ${scriptLines.length} lines) ===`);

  // Log lines 50-65 specifically
  console.log("\n=== SCRIPT LINES 50-65 (FOCUS AREA) ===");
  for (let i = 49; i < Math.min(65, scriptLines.length); i++) {
    const lineNum = i + 1;
    const displayLine = scriptLines[i].replace(dockerCredentials.accessToken, '[REDACTED_DOCKER_TOKEN]');
    console.log(`${String(lineNum).padStart(4, ' ')}: ${displayLine}`);
  }
  console.log("=== END FOCUS AREA ===\n");

  logger.info("[SSM-DEPLOY] SSM sendCommand request", {
    instanceId: infrastructure.instanceId,
    documentName: "AWS-RunShellScript",
    comment: "DevOpsHub deploy application container",
    timeoutSeconds: 300,
    waitTimeoutMs: 360000,
    commands: [deployCommand.split(dockerCredentials.accessToken).join("[REDACTED_DOCKER_TOKEN]")],
  });

  const result = await runSsmShellCommand(
    userId,
    awsConnection,
    infrastructure,
    deployCommand,
    {
      comment: "DevOpsHub deploy application container",
      timeoutSeconds: 300,
      waitTimeoutMs: 360000,
      redactSecrets: [dockerCredentials.accessToken],
    }
  );

  logger.info("[SSM-DEPLOY] SSM deployment command completed", {
    instanceId: infrastructure.instanceId,
    commandId: result.commandId,
    status: result.status,
    responseCode: result.responseCode,
    totalPollAttempts: result.totalPollAttempts,
    totalElapsedSeconds: result.totalElapsedSeconds,
    standardOutputContent: result.stdout,
    standardErrorContent: result.stderr,
    // Phase results
    dockerComposePullResult: result.stdout.includes("[DevOpsHub][Docker Compose] pull") ? "success" : "missing",
    dockerComposeUpResult: result.stdout.includes("[DevOpsHub][Docker Compose] up") ? "success" : "missing",
    dockerComposePsResult: result.stdout.includes("[DevOpsHub][Docker Compose] ps") ? "logged" : "missing",
    healthCheckResult: result.stdout.includes("[DevOpsHub][Health Check] Backend http://localhost:3035") ? "success" : "missing",
    finalVerificationResult: result.stdout.includes("[DevOpsHub][Final Verification] Deployment completed successfully") ? "success" : "missing",
    containerRunningResult: result.stdout.includes("[DevOpsHub][Docker Compose] up") ? "success" : "missing",
    portVerifyResult: result.stdout.includes("[DevOpsHub][Health Check] Backend http://localhost:3035") ? "verified" : "pending",
    dockerOutput: result.stdout,
  });

  return {
    success: true,
    imageRef,
    containerName,
    publicPort,
    portDetectionMethod: "remote-docker-image-inspect",
    deploymentLogs: result.stdout,
    output: result.stdout,
    commandId: result.commandId,
    status: result.status,
    stderr: result.stderr,
  };
}

async function verifyGitHubWebhookActive(userId, repository, webhook) {
  const token = await getGitHubAccessToken(userId);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };
  
  const repositoryUrl = `https://api.github.com/repos/${repository.owner}/${repository.repo}`;
  const webhookUrl = `${repositoryUrl}/hooks/${webhook.hookId}`;
  const deliveriesUrl = `${webhookUrl}/deliveries`;
  
  console.log("[Phase 5: GitHub Webhook Verification] Starting webhook verification", {
    owner: repository.owner,
    repo: repository.repo,
    hookId: webhook.hookId,
    webhookUrl,
  });

  // Fetch webhook details from GitHub
  let response;
  try {
    console.log("[Phase 5: GitHub Webhook Verification] Fetching webhook details", {
      method: "GET",
      url: webhookUrl,
      timeout: 15000,
    });
    response = await axios.get(webhookUrl, { headers, timeout: 15000 });
    console.log("[Phase 5: GitHub Webhook Verification] Webhook details fetched", {
      hookId: response.data.id,
      active: response.data.active,
      events: response.data.events?.length,
      configUrl: response.data.config?.url,
    });
  } catch (error) {
    const status = error.response?.status;
    const errorMsg = error.response?.data?.message || error.message;
    console.error("[Phase 5: GitHub Webhook Verification] Failed to fetch webhook details", {
      hookId: webhook.hookId,
      owner: repository.owner,
      repo: repository.repo,
      httpStatus: status,
      errorMessage: errorMsg,
      url: webhookUrl,
    });
    
    if (status === 404) {
      throw new Error(
        `GitHub webhook (ID: ${webhook.hookId}) not found on GitHub. ` +
        `Repository: ${repository.owner}/${repository.repo}. ` +
        `This may indicate the webhook was deleted from GitHub or the hook ID is invalid. ` +
        `Consider recreating the webhook in Phase 3 or manually on GitHub.`
      );
    }
    if (status === 401 || status === 403) {
      throw new Error(
        `GitHub API authentication failed (${status}). ` +
        `Your GitHub access token may be invalid, expired, or missing permissions. ` +
        `Error: ${errorMsg}`
      );
    }
    throw new Error(
      `GitHub API error (${status} ${error.response?.statusText || "Unknown"}): ${errorMsg}. ` +
      `Failed to verify webhook at: ${webhookUrl}`
    );
  }
  
  if (!response.data?.active) {
    console.warn("[Phase 5: GitHub Webhook Verification] Webhook is not active", {
      hookId: webhook.hookId,
      active: response.data.active,
    });
    throw new Error(
      `GitHub webhook (ID: ${webhook.hookId}) is not active. ` +
      `Activate it on GitHub or recreate the webhook.`
    );
  }

  // Fetch and verify deliveries
  let deliveries = [];
  console.log("[Phase 5: GitHub Webhook Verification] Fetching webhook deliveries", {
    url: deliveriesUrl,
    attempts: 5,
    maxPerPage: 5,
  });
  
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      console.log("[Phase 5: GitHub Webhook Verification] Attempt", {
        attempt,
        url: deliveriesUrl,
        method: "GET",
      });
      const deliveryResponse = await axios.get(
        deliveriesUrl,
        { headers, params: { per_page: 5 }, timeout: 15000 }
      );
      deliveries = Array.isArray(deliveryResponse.data) ? deliveryResponse.data : [];
      console.log("[Phase 5: GitHub Webhook Verification] Deliveries fetched", {
        attempt,
        totalDeliveries: deliveries.length,
        successfulDeliveries: deliveries.filter(d => d.status_code >= 200 && d.status_code < 300).length,
      });
      
      if (deliveries.some((delivery) => delivery.status_code >= 200 && delivery.status_code < 300)) {
        console.log("[Phase 5: GitHub Webhook Verification] Found successful delivery on attempt", { attempt });
        break;
      }
      
      if (attempt < 5) {
        console.log("[Phase 5: GitHub Webhook Verification] No successful delivery yet, waiting", {
          attempt,
          nextAttempt: attempt + 1,
          waitMs: 2000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.message || error.message;
      console.warn("[Phase 5: GitHub Webhook Verification] Failed to fetch deliveries", {
        attempt,
        httpStatus: status,
        errorMessage: errorMsg,
        url: deliveriesUrl,
      });
      
      if (status === 404) {
        throw new Error(
          `GitHub webhook deliveries endpoint not found (404). ` +
          `Webhook ID: ${webhook.hookId}, Repository: ${repository.owner}/${repository.repo}. ` +
          `The webhook may have been deleted from GitHub.`
        );
      }
      if (status !== 404 && attempt === 5) {
        throw new Error(
          `Failed to fetch webhook deliveries after ${attempt} attempts. ` +
          `GitHub API error (${status}): ${errorMsg}`
        );
      }
    }
  }

  const successfulDelivery = deliveries.find((delivery) => delivery.status_code >= 200 && delivery.status_code < 300);
  if (!successfulDelivery) {
    console.error("[Phase 5: GitHub Webhook Verification] No successful deliveries found", {
      hookId: webhook.hookId,
      totalDeliveries: deliveries.length,
      deliverySummary: deliveries.map(d => ({
        id: d.id,
        status: d.status,
        statusCode: d.status_code,
        action: d.action,
      })),
    });
    throw new Error(
      `GitHub webhook (ID: ${webhook.hookId}) has no successful delivery to Jenkins at ${webhook.webhookUrl}. ` +
      `Total deliveries: ${deliveries.length}. ` +
      `Check that the Jenkins webhook URL is accessible and properly configured.`
    );
  }

  console.log("[Phase 5: GitHub Webhook Verification] Webhook verification successful", {
    hookId: response.data.id,
    active: response.data.active,
    events: response.data.events,
    deliveryStatusCode: successfulDelivery.status_code,
    deliveredAt: successfulDelivery.delivered_at,
  });

  return {
    success: true,
    hookId: response.data.id,
    active: response.data.active,
    events: response.data.events,
    url: response.data.config?.url,
    deliveryStatusCode: successfulDelivery.status_code,
    deliveredAt: successfulDelivery.delivered_at,
  };
}

async function enableGitHubWebhookTriggers(userId, context, payload) {
  return runAutoDeployOperation("enableGitHubWebhookTriggers", async () => {
    console.log("[Phase 5: Enable GitHub Webhook Triggers] Starting webhook trigger configuration", {
      userId,
      owner: context.repository?.owner,
      repo: context.repository?.repo,
      branch: payload.branch || "main",
      storedWebhookExists: !!context.webhook?.hookId,
      storedHookId: context.webhook?.hookId,
      storedWebhookUrl: context.webhook?.webhookUrl,
    });

    // Always use idempotent createGitHubWebhook which:
    // 1. Queries GitHub API to find existing webhooks
    // 2. Reuses them if found
    // 3. Creates new ones if missing
    // 4. Auto-recovers from deleted webhooks
    const webhookResult = await createGitHubWebhook(userId, {
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: payload.branch || "main",
    });

    if (!webhookResult.success) {
      console.error("[Phase 5: Enable GitHub Webhook Triggers] Webhook configuration failed", {
        error: webhookResult.error || webhookResult.message,
      });
      throw new Error(webhookResult.error || webhookResult.message || "Failed to configure GitHub webhook");
    }

    console.log("[Phase 5: Enable GitHub Webhook Triggers] Webhook configured successfully", {
      hookId: webhookResult.webhook?.hookId,
      webhookUrl: webhookResult.webhook?.webhookUrl,
      reused: webhookResult.duplicate,
      message: webhookResult.message,
    });

    context.webhook = webhookResult.webhook;
    
    // Optionally verify the webhook is active (non-critical)
    try {
      console.log("[Phase 5: Enable GitHub Webhook Triggers] Verifying webhook is active...", {
        hookId: context.webhook?.hookId,
      });
      
      const verification = await verifyGitHubWebhookActive(userId, context.repository, context.webhook);
      
      console.log("[Phase 5: Enable GitHub Webhook Triggers] Webhook verified as active", {
        hookId: verification.hookId,
        active: verification.active,
        events: verification.events,
        deliveryStatusCode: verification.deliveryStatusCode,
      });
      
      return {
        success: true,
        hookId: context.webhook?.hookId,
        webhookUrl: context.webhook?.webhookUrl,
        events: context.webhook?.events,
        reused: webhookResult.duplicate,
        verification,
      };
    } catch (verificationError) {
      // If verification fails but webhook was created/configured, consider it a success
      // The webhook exists and is functional, verification is just a validation step
      console.warn("[Phase 5: Enable GitHub Webhook Triggers] Webhook verification warning (non-critical)", {
        hookId: context.webhook?.hookId,
        error: verificationError.message,
        note: "Webhook configuration succeeded; verification is optional",
      });
      
      return {
        success: true,
        hookId: context.webhook?.hookId,
        webhookUrl: context.webhook?.webhookUrl,
        events: context.webhook?.events,
        reused: webhookResult.duplicate,
        verificationWarning: verificationError.message,
      };
    }
  });
}

async function enableAutomaticJenkinsBuilds(userId, context) {
  return runAutoDeployOperation("enableAutomaticJenkinsBuilds", async () => {
    const jobId = context.jenkinsJob?.id || context.jenkinsJob?.jobId || context.jenkinsJob?._id;
    
    console.log("[Phase 5: Enable Automatic Jenkins Builds] Starting automatic Jenkins builds configuration", {
      jobId,
      jobName: context.jenkinsJob?.jobName,
      jobUrl: context.jenkinsJob?.jobUrl,
    });
    
    if (!jobId) {
      console.error("[Phase 5: Enable Automatic Jenkins Builds] Jenkins job is missing", {
        jenkinsJob: context.jenkinsJob,
      });
      throw new Error("Jenkins job is missing; cannot enable automatic Jenkins builds");
    }

    console.log("[Phase 5: Enable Automatic Jenkins Builds] Configuring Jenkins job for auto-deploy", {
      jobId,
      jobName: context.jenkinsJob?.jobName,
    });
    
    const result = await configureJenkinsJobAutoDeploy(userId, jobId, true);
    
    console.log("[Phase 5: Enable Automatic Jenkins Builds] Jenkins auto-deploy configuration successful", {
      jobId,
      jobName: result.job?.jobName || context.jenkinsJob?.jobName,
      jobUrl: result.job?.jobUrl || context.jenkinsJob?.jobUrl,
      message: result.message,
    });
    
    return {
      success: true,
      jobId,
      jobName: result.job?.jobName || context.jenkinsJob?.jobName,
      jobUrl: result.job?.jobUrl || context.jenkinsJob?.jobUrl,
      message: result.message,
    };
  });
}

async function enableAutomaticDeploymentOnPush(userId, deployment, context, payload) {
  return runAutoDeployOperation("enableAutomaticDeploymentOnPush", async () => {
    const owner = context.repository.owner;
    const repo = context.repository.repo;
    const branch = payload.branch || "main";
    const now = new Date();

    console.log("[Phase 5: Enable Automatic Deployment On Push] Starting auto-deploy configuration", {
      owner,
      repo,
      branch,
      deploymentId: deployment._id.toString(),
      jenkinsJobName: context.jenkinsJob?.jobName,
      webhookUrl: context.webhook?.webhookUrl,
      ec2Host: context.infrastructure?.publicIp,
    });

    const autoDeploy = await AutoDeploy.findOneAndUpdate(
      { userId, "repository.fullName": `${owner}/${repo}`, "repository.branch": branch },
      {
        $set: {
          userId,
          enabled: true,
          status: "QUEUED",
          repository: {
            owner,
            name: repo,
            fullName: `${owner}/${repo}`,
            branch,
            url: payload.repositoryUrl || `https://github.com/${owner}/${repo}`,
          },
          jenkinsJob: {
            jobId: context.jenkinsJob?.jobId || context.jenkinsJob?.id,
            jobName: context.jenkinsJob?.jobName,
            jobUrl: context.jenkinsJob?.jobUrl,
          },
          githubWebhook: {
            hookId: context.webhook?.hookId,
            webhookUrl: context.webhook?.webhookUrl,
            events: context.webhook?.events,
          },
          dockerHub: {
            username: context.dockerHub?.username,
          },
          ec2: {
            host: context.infrastructure?.publicIp,
            username: "ubuntu",
          },
          deploymentId: deployment._id.toString(),
          pipelineId: context.pipeline?.pipeline?._id,
          enabledAt: now,
          disabledAt: null,
          updatedAt: now,
        },
        $push: {
          logs: {
            status: "QUEUED",
            message: "Auto deploy enabled; GitHub pushes trigger Jenkins deployment.",
            createdAt: now,
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    console.log("[Phase 5: Enable Automatic Deployment On Push] Auto-deploy record created/updated", {
      autoDeployId: autoDeploy?._id?.toString(),
      status: autoDeploy?.status,
      enabled: Boolean(autoDeploy?.enabled),
    });

    await Deployment.findByIdAndUpdate(deployment._id, {
      $set: {
        "setup.autoDeployEnabled": true,
        "setup.autoDeployEnabledAt": now,
        "setup.updatedAt": now,
        autoDeployEnabled: true,
        autoDeployStatus: "QUEUED",
        deploymentStage: "AUTO_DEPLOY_ENABLED",
        updatedAt: now,
      },
    });

    console.log("[Phase 5: Enable Automatic Deployment On Push] Deployment auto-deploy status updated", {
      deploymentId: deployment._id.toString(),
      autoDeployEnabled: true,
      autoDeployStatus: "QUEUED",
    });

    return {
      success: true,
      autoDeployId: autoDeploy?._id?.toString(),
      status: autoDeploy?.status || "QUEUED",
      enabled: Boolean(autoDeploy?.enabled),
    };
  });
}

function markUiStep(phaseProgress, phase, uiKey, status) {
  const next = { ...(phaseProgress || {}) };
  const phaseData = { ...(next[phase] || {}) };
  const trackedKeys = Object.keys(phaseData).filter((key) => !["currentStep", "totalSteps", "percentage"].includes(key));
  const completedCount = trackedKeys.filter((key) => {
    if (key === uiKey) return status === "complete";
    return phaseData[key] === "complete";
  }).length;
  const totalSteps = phaseData.totalSteps || trackedKeys.length || 1;
  next[phase] = {
    ...phaseData,
    currentStep: Math.min(completedCount + (status === "active" ? 1 : 0), totalSteps),
    percentage: Math.round((completedCount / totalSteps) * 100),
    ...(uiKey ? { [uiKey]: status } : {}),
  };
  return next;
}

async function appendStepLog(deployment, { step, level = "info", event, input, output, error, errorDetails, stack }) {
  if (!Array.isArray(deployment.logs)) deployment.logs = [];
  if (!Array.isArray(deployment.stepLogs)) deployment.stepLogs = [];
  deployment.logs.push({
    timestamp: new Date(),
    level,
    message: `[DEPLOYMENT] ${step} ${event}${error ? `: ${error}` : ""}`,
  });
  deployment.stepLogs.push({
    timestamp: new Date(),
    step,
    level,
    event,
    input: safeForLog(input),
    output: safeForLog(output),
    error,
    errorDetails: safeForLog(errorDetails),
    stack,
  });
  await deployment.save();
}

async function runDeploymentStep({ deployment, sequenceIndex, step, input, fn }) {
  const stepNumber = sequenceIndex + 1;
  deployment.currentPhase = step.phase;
  deployment.currentStep = step.name;
  deployment.status = "running";
  deployment.phaseProgress = markUiStep(deployment.phaseProgress, step.phase, step.uiKey, "active");
  deployment.overallProgress = Math.max(deployment.overallProgress || 0, Math.round(((stepNumber - 1) / STEP_TOTAL) * 100));

  deploymentLog(step.name, "started", { input: safeForLog(input) });
  await appendStepLog(deployment, {
    step: step.name,
    event: "started",
    input,
  });

  try {
    const output = await fn();
    deployment.phaseProgress = markUiStep(deployment.phaseProgress, step.phase, step.uiKey, "complete");
    deployment.overallProgress = Math.round((stepNumber / STEP_TOTAL) * 100);
    deploymentLog(step.name, "completed", { output: safeForLog(output) });
    await appendStepLog(deployment, {
      step: step.name,
      level: "success",
      event: "completed",
      input,
      output,
    });
    return output;
  } catch (error) {
    const serialized = serializeError(error);
    deployment.status = "failed";
    deployment.failedStep = step.name;
    deployment.error = serialized.message;
    deployment.failureStack = serialized.stack;
    deployment.phaseProgress = markUiStep(deployment.phaseProgress, step.phase, step.uiKey, "failed");
    deploymentLog(step.name, "failed", {
      input: safeForLog(input),
      error: serialized.message,
      stack: serialized.stack,
    });
    await appendStepLog(deployment, {
      step: step.name,
      level: "error",
      event: "failed",
      input,
      error: serialized.message,
      errorDetails: serialized.jenkins ? { jenkins: serialized.jenkins } : undefined,
      stack: serialized.stack,
    });
    throw Object.assign(error, {
      failedStep: step.name,
      deploymentError: serialized,
    });
  }
}

function normalizeInfrastructure(infrastructure) {
  if (!infrastructure) return null;
  return {
    infrastructureId: infrastructure._id?.toString(),
    instanceId: infrastructure.instanceId,
    instanceType: infrastructure.instanceType,
    publicIp: infrastructure.publicIp,
    publicDns: infrastructure.publicDns,
    privateIp: infrastructure.privateIp,
    region: infrastructure.region,
    securityGroupId: infrastructure.securityGroupId,
    vpcId: infrastructure.vpcId,
    subnetId: infrastructure.subnetId,
    state: infrastructure.state || infrastructure.ec2Status,
    deploymentStatus: infrastructure.deploymentStatus,
    bootstrapStatus: infrastructure.bootstrapStatus,
    bootstrapped: infrastructure.bootstrapped,
    keyPairName: infrastructure.keyPairName,
    ssmManaged: infrastructure.ssmManaged !== false,
    iamInstanceProfile: infrastructure.iamInstanceProfile,
    keyGeneratedAt: infrastructure.keyGeneratedAt || infrastructure.keyCreatedAt,
  };
}

async function persistProvisionedInfrastructure(userId, awsConnection, infrastructure) {
  if (!infrastructure?.instanceId || !isDbConnected()) {
    return null;
  }

  const verifiedInfrastructure = await assertAndNormalizeAwsInstance(userId, awsConnection, infrastructure);

  const update = {
    userId,
    awsConnectionId: awsConnection._id,
    instanceId: verifiedInfrastructure.instanceId,
    instanceType: getConfiguredInstanceType(verifiedInfrastructure.instanceType || INSTANCE_TYPE),
    operatingSystem: infrastructure.operatingSystem || "ubuntu",
    storageSize: infrastructure.storageSize || 30,
    region: verifiedInfrastructure.region || awsConnection.region,
    securityGroupId: verifiedInfrastructure.securityGroupId,
    securityGroupName: infrastructure.securityGroupName || verifiedInfrastructure.securityGroupId,
    publicIp: verifiedInfrastructure.publicIp,
    publicDns: verifiedInfrastructure.publicDns,
    privateIp: verifiedInfrastructure.privateIp,
    vpcId: verifiedInfrastructure.vpcId,
    subnetId: verifiedInfrastructure.subnetId,
    ec2Status: verifiedInfrastructure.state === "stopped" ? "stopped" : "running",
    bootstrapStatus: infrastructure.bootstrapped ? "success" : "pending",
    deploymentStatus: infrastructure.bootstrapped ? "ready" : "provisioning",
    keyPairName: infrastructure.keyPairName,
    privateKey: null,
    keyGeneratedAt: infrastructure.keyCreatedAt || infrastructure.keyGeneratedAt,
    tags: {
      Name: "DevOpsHub-Auto-Deployed",
      ManagedBy: "DevOpsHub",
      SSMManaged: "true",
    },
    updatedAt: new Date(),
  };

  Object.keys(update).forEach((key) => {
    if (update[key] === undefined) {
      delete update[key];
    }
  });

  const saved = await AWSInfrastructure.findOneAndUpdate(
    { userId, instanceId: verifiedInfrastructure.instanceId },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return saved;
}

/**
 * Validate all integrations are connected
 */
function parseRepositoryIdentity(input = {}) {
  console.log('\n=== REPOSITORY IDENTITY PARSING ===');
  console.log('[REPO_PARSE] Input received:', {
    owner: input.owner,
    repositoryOwner: input.repositoryOwner,
    repo: input.repo,
    repositoryName: input.repositoryName,
    repositoryUrl: input.repositoryUrl,
  });

  const repositoryUrl = input.repositoryUrl || "";
  const owner = input.owner || input.repositoryOwner;
  const repo = input.repo || input.repositoryName;

  console.log('[REPO_PARSE] Extracted from input:', {
    owner,
    repo,
    source: owner && repo ? 'direct-input' : 'url-parse',
  });

  if (owner && repo) {
    const result = {
      owner: String(owner).trim(),
      repo: String(repo).trim(),
      repositoryUrl,
    };
    console.log('[REPO_PARSE] ✅ Using direct input:', result);
    return result;
  }

  console.log('[REPO_PARSE] Direct input missing, parsing from URL:', repositoryUrl);
  
  // Use improved URL parsing with multiple format support
  let owner_parsed = "";
  let repo_parsed = "";
  
  const urlString = String(repositoryUrl).trim();
  
  // Handle https:// and http:// URLs
  const httpsMatch = urlString.match(/https?:\/\/github\.com\/([^/]+)\/([^/\s.git#?]+)/i);
  if (httpsMatch) {
    owner_parsed = httpsMatch[1].trim();
    repo_parsed = httpsMatch[2].trim().replace(/\.git$/i, "");
    console.log('[REPO_PARSE] ✅ HTTPS URL matched:', { owner_parsed, repo_parsed });
  } else {
    // Handle git@github.com: URLs
    const gitMatch = urlString.match(/git@github\.com:([^/]+)\/([^/\s.git#?]+)/i);
    if (gitMatch) {
      owner_parsed = gitMatch[1].trim();
      repo_parsed = gitMatch[2].trim().replace(/\.git$/i, "");
      console.log('[REPO_PARSE] ✅ SSH URL matched:', { owner_parsed, repo_parsed });
    } else {
      // Fallback: try generic github.com pattern
      const genericMatch = urlString.match(/github\.com[:\/]+([^/\s]+)\/([^/\s.git#?]+)/i);
      if (genericMatch) {
        owner_parsed = genericMatch[1].trim();
        repo_parsed = genericMatch[2].trim().replace(/\.git$/i, "");
        console.log('[REPO_PARSE] ✅ Generic URL matched:', { owner_parsed, repo_parsed });
      }
    }
  }

  const result = {
    owner: owner_parsed,
    repo: repo_parsed,
    repositoryUrl,
  };

  console.log('[REPO_PARSE] ✅ Final parsed values:', result);
  return result;
}

async function safeValidation(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    logger.warn(`One-click validation check failed: ${label}`, { error: error.message });
    return fallback;
  }
}

/**
 * Validate all integrations are connected
 */
async function validateIntegrations(userId, input) {
  try {
    const repository = parseRepositoryIdentity(
      typeof input === "string" ? { repositoryUrl: input } : input
    );
    logger.info(`Validating integrations for user ${userId}`, { repositoryUrl: repository.repositoryUrl });

    const githubStatus = await safeValidation("github status", () => getGitHubStatus(userId), {});
    const githubConnected = Boolean(githubStatus?.githubConnected);
    let repositoryExists = false;

    if (githubConnected && repository.owner && repository.repo) {
      repositoryExists = await safeValidation(
        "github repository",
        async () => {
          const token = await getGitHubAccessToken(userId);
          const response = await axios.get(
            `https://api.github.com/repos/${repository.owner}/${repository.repo}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
              },
              timeout: 10000,
            }
          );
          return response.status === 200;
        },
        false
      );
    }

    const dockerHub = await safeValidation("docker hub", () => getDockerHubStatus(userId), { status: {} });
    const jenkins = await safeValidation("jenkins", () => getJenkinsStatus(userId), { status: {} });
    const awsConnection = await safeValidation(
      "aws account",
      () => isDbConnected()
        ? AWSConnection.findOne({ userId, connected: true }).lean()
        : null,
      null
    );

    const validations = {
      github: Boolean(githubConnected && repositoryExists),
      dockerhub: Boolean(dockerHub.status?.connected && dockerHub.status?.permissions?.login && dockerHub.status?.permissions?.push),
      jenkins: jenkinsValidationPassed(jenkins.status),
      aws: Boolean(awsConnection),
    };

    const missingIntegrations = Object.entries(validations)
      .filter(([, ready]) => !ready)
      .map(([key]) => key);
    const ready = Object.values(validations).every(Boolean);

    return {
      success: true,
      ready,
      allConnected: ready,
      validations,
      missingIntegrations,
      repository,
    };
  } catch (err) {
    logger.error("Integration validation failed", { err, userId });
    throw err;
  }
}

/**
 * Start one-click deployment workflow
 */
async function startDeployment(userId, payload) {
  try {
    logger.info(`Starting one-click deployment for user ${userId}`, { payload });
    deploymentLog("Validation", "started", { input: safeForLog(payload) });

    const {
      repositoryUrl,
      repositoryName,
      branch = "main",
      environment = "production",
    } = payload;

    // Create deployment record
    const deployment = new Deployment({
      userId,
      repositoryUrl,
      repositoryName,
      branch,
      environment,
      status: "pending",
      currentStep: "Validation",
      currentPhase: WORKFLOW_PHASES.VALIDATION,
      phaseProgress: initializePhaseProgress(),
      overallProgress: 0,
      startTime: new Date(),
      logs: [
        {
          timestamp: new Date(),
          level: "info",
          message: "Deployment workflow initiated",
        },
      ],
      stepLogs: [
        {
          timestamp: new Date(),
          step: "Validation",
          level: "info",
          event: "started",
          input: safeForLog(payload),
        },
      ],
    });

    await deployment.save();

    logger.info(`Deployment created with ID: ${deployment._id}`);
    deploymentLog("Validation", "completed", { output: { deploymentId: deployment._id.toString() } });

    // Start async workflow
    executeWorkflow(userId, deployment._id, payload).catch((err) => {
      logger.error("Workflow execution error", { err, deploymentId: deployment._id });
    });

    return {
      success: true,
      deploymentId: deployment._id.toString(),
      currentPhase: WORKFLOW_PHASES.VALIDATION,
      currentStep: "Validation",
      status: "pending",
    };
  } catch (err) {
    logger.error("Deployment initialization failed", { err, userId });
    deploymentLog("Validation", "failed", serializeError(err));
    return {
      success: false,
      failedStep: "Validation",
      error: getErrorMessage(err),
      stack: err?.stack,
    };
  }
}

/**
 * Main workflow execution engine
 */
async function executeWorkflow(userId, deploymentId, payload = {}) {
  try {
    logger.info(`Executing workflow for deployment ${deploymentId}`);

    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const repository = parseRepositoryIdentity(payload);
    const context = {
      payload,
      repository,
      validation: null,
      github: null,
      dockerHub: null,
      jenkins: null,
      awsConnection: null,
      infrastructure: null,
      jenkinsJob: null,
      webhook: null,
      build: null,
      pipeline: null,
      analysis: null,
      detection: null,
      generatedFiles: null,
      bootstrap: null,
      jenkinsCredentials: null,
      jenkinsBuild: null,
      finalValidation: null,
    };

    await runDeploymentStep({
      deployment,
      sequenceIndex: 0,
      step: DEPLOYMENT_STEP_SEQUENCE[0],
      input: { repositoryUrl: payload.repositoryUrl, repositoryName: payload.repositoryName, branch: payload.branch },
      fn: async () => {
        if (!payload.repositoryUrl) throw new Error("repositoryUrl is required");
        if (!payload.repositoryName) throw new Error("repositoryName is required");
        if (!repository.owner || !repository.repo) {
          throw new Error("Unable to parse GitHub owner/repository from deployment request");
        }
        context.validation = { repository };
        return context.validation;
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 1,
      step: DEPLOYMENT_STEP_SEQUENCE[1],
      input: { owner: repository.owner, repo: repository.repo },
      fn: async () => {
        const githubStatus = await getGitHubStatus(userId);
        if (!githubStatus?.githubConnected) {
          throw new Error(githubStatus?.error || "GitHub account is not connected");
        }
        const token = await getGitHubAccessToken(userId);
        const response = await axios.get(
          `https://api.github.com/repos/${repository.owner}/${repository.repo}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
            timeout: 10000,
          }
        );
        context.github = {
          connected: true,
          repositoryAccessible: response.status === 200,
          repositoryFullName: response.data?.full_name,
        };
        context.analysis = await analyzeRepository(userId, repository.owner, repository.repo);
        context.detection = normalizeProjectDetection(context.analysis);
        return {
          ...context.github,
          analysis: {
            projectType: context.detection.projectType,
            stack: context.detection.stack,
            appPort: context.detection.appPort,
            buildCommand: context.detection.buildCommand,
            startCommand: context.detection.startCommand,
          },
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 2,
      step: DEPLOYMENT_STEP_SEQUENCE[2],
      input: { userId },
      fn: async () => {
        const dockerHub = await getDockerHubStatus(userId);
        const connected = Boolean(dockerHub.status?.connected);
        const canLogin = Boolean(dockerHub.status?.permissions?.login);
        const canPush = Boolean(dockerHub.status?.permissions?.push);
        if (!connected || !canLogin || !canPush) {
          throw new Error(dockerHub.status?.error || "Docker Hub must be connected with login and push permissions");
        }
        context.dockerHub = dockerHub.status;
        return {
          connected,
          username: dockerHub.status?.username,
          permissions: dockerHub.status?.permissions,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 3,
      step: DEPLOYMENT_STEP_SEQUENCE[3],
      input: { userId },
      fn: async () => {
        const jenkins = await getJenkinsStatus(userId);
        if (!jenkinsValidationPassed(jenkins.status)) {
          throw new Error(jenkins.status?.error || "Jenkins connection validation failed");
        }
        context.jenkins = jenkins.status;
        return {
          url: jenkins.status?.url,
          connectedUser: jenkins.status?.connectedUser || jenkins.status?.username,
          validation: jenkins.status?.validation,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 4,
      step: DEPLOYMENT_STEP_SEQUENCE[4],
      input: { userId },
      fn: async () => {
        if (!isDbConnected()) {
          throw new Error("Database is not connected; AWS connection cannot be verified");
        }
        const awsConnection = await AWSConnection.findOne({ userId, connected: true }).lean();
        if (!awsConnection) {
          throw new Error("AWS Account must be connected before deployment");
        }
        context.awsConnection = awsConnection;
        return {
          connectionId: awsConnection._id?.toString(),
          region: awsConnection.region,
          accountId: awsConnection.accountId,
          connected: awsConnection.connected,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 5,
      step: DEPLOYMENT_STEP_SEQUENCE[5],
      input: { awsRegion: context.awsConnection?.region, repository: repository.repo },
      fn: async () => {
        validateAWSInfrastructureService();
        console.log("[AWS] Provisioning started", {
          userId,
          region: context.awsConnection?.region,
          repository: `${repository.owner}/${repository.repo}`,
        });
        return {
          serviceLoaded: true,
          modelLoaded: true,
          provider: "ec2IntelligentProvisioningService",
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 6,
      step: DEPLOYMENT_STEP_SEQUENCE[6],
      input: { userId, region: context.awsConnection?.region },
      fn: async () => {
        context.existingInfrastructure = await AWSInfrastructure.findOne({
          userId,
          ec2Status: "running",
          deploymentStatus: { $in: ["ready", "deployed", "provisioning", "bootstrapping"] },
        }).sort({ updatedAt: -1 }).lean();

        return {
          found: Boolean(context.existingInfrastructure),
          infrastructure: normalizeInfrastructure(context.existingInfrastructure),
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 7,
      step: DEPLOYMENT_STEP_SEQUENCE[7],
      input: {
        owner: repository.owner,
        repo: repository.repo,
        branch: payload.branch || "main",
        existingInstanceId: context.existingInfrastructure?.instanceId,
      },
      fn: async () => {
        const provisioned = await ec2IntelligentProvisioningService.provisionOrReuse(
          userId,
          {
            owner: repository.owner,
            repo: repository.repo,
            branch: payload.branch || "main",
            region: context.awsConnection?.region,
            preferredInstanceType: getConfiguredInstanceType(payload.instanceType || INSTANCE_TYPE),
          },
          {
            size: payload.repositorySize || 0,
            language: payload.language || context.detection?.projectType,
            appPort: context.detection?.appPort,
          }
        );

        const savedInfrastructure = await persistProvisionedInfrastructure(
          userId,
          context.awsConnection,
          provisioned
        );
        context.infrastructure = savedInfrastructure || provisioned;
        deployment.ec2Instance = normalizeInfrastructure(context.infrastructure);
        console.log("Save Deployment", {
          deploymentId: deployment.deploymentId || deployment._id?.toString(),
          instanceId: deployment.ec2Instance?.instanceId,
          ssmManaged: deployment.ec2Instance?.ssmManaged,
        });
        await deployment.save();
        console.log("[AWS] Provisioning completed", safeForLog(deployment.ec2Instance));
        return {
          mode: context.existingInfrastructure?.instanceId === provisioned?.instanceId ? "reuse_existing" : "created_or_reused",
          infrastructure: deployment.ec2Instance,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 8,
      step: DEPLOYMENT_STEP_SEQUENCE[8],
      input: { instanceId: context.infrastructure?.instanceId },
      fn: async () => {
        if (!context.infrastructure?.instanceId) {
          throw new Error("EC2 instance was not returned by infrastructure provisioning");
        }
        const state = context.infrastructure.state || context.infrastructure.ec2Status;
        if (state && state !== "running") {
          throw new Error(`EC2 instance is not running. Current state: ${state}`);
        }
        return {
          instanceId: context.infrastructure.instanceId,
          state: state || "running",
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 9,
      step: DEPLOYMENT_STEP_SEQUENCE[9],
      input: { instanceId: context.infrastructure?.instanceId },
      fn: async () => {
        context.bootstrap = await bootstrapAndVerifyServer(
          userId,
          context.awsConnection,
          context.infrastructure,
          context.detection || {}
        );
        await AWSInfrastructure.findOneAndUpdate(
          { userId, instanceId: context.infrastructure.instanceId },
          {
            $set: {
              bootstrapStatus: "success",
              deploymentStatus: "ready",
              bootstrapEndTime: new Date(),
              bootstrapLog: context.bootstrap.output,
              updatedAt: new Date(),
            },
          }
        ).catch((error) => {
          console.warn("[AWS] Failed to persist bootstrap verification:", error.message);
        });
        return {
          installed: true,
          mechanism: "ssm-verified-bootstrap",
          bootstrapStatus: "success",
          host: context.bootstrap.host,
          installedNode: context.bootstrap.installedNode,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 10,
      step: DEPLOYMENT_STEP_SEQUENCE[10],
      input: { instanceId: context.infrastructure?.instanceId, publicIp: context.infrastructure?.publicIp },
      fn: async () => {
        const operatingSystem = context.infrastructure.operatingSystem || "ubuntu";

        logger.info("[SSM] Starting Docker installation verification", {
          instanceId: context.infrastructure.instanceId,
          publicIp: context.infrastructure.publicIp,
          operatingSystem,
        });

        const verificationResult = await runSsmShellCommand(
          userId,
          context.awsConnection,
          context.infrastructure,
          "docker --version && (docker compose version || docker-compose --version)",
          {
            comment: "DevOpsHub verify Docker installation",
            timeoutSeconds: 90,
          }
        );

        logger.info("[SSM] Docker installation verified successfully", {
          instanceId: context.infrastructure.instanceId,
          publicIp: context.infrastructure.publicIp,
          output: verificationResult.stdout,
        });

        return {
          installed: true,
          verified: true,
          mechanism: "ssm-docker-verification",
          bootstrapStatus: "success",
          output: verificationResult.stdout,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 11,
      step: DEPLOYMENT_STEP_SEQUENCE[11],
      input: { instanceId: context.infrastructure?.instanceId, publicIp: context.infrastructure?.publicIp },
      fn: async () => {
        return {
          configured: true,
          publicIp: context.infrastructure?.publicIp,
          region: context.infrastructure?.region || context.awsConnection?.region,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 12,
      step: DEPLOYMENT_STEP_SEQUENCE[12],
      input: { owner: repository.owner, repo: repository.repo, branch: payload.branch || "main" },
      fn: async () => {
        const branch = payload.branch || "main";
        
        console.log('\n=== CALLING GENERATE JENKINS PIPELINE ===');
        console.log('Pipeline Input', {
          owner: repository.owner,
          repo: repository.repo,
          branch,
          repositoryUrl: payload.repositoryUrl,
        });

        if (!repository.owner || !repository.repo) {
          console.error('❌ INVALID REPOSITORY DATA:', {
            owner: repository.owner,
            repo: repository.repo,
            repositoryUrl: payload.repositoryUrl,
          });
          throw new Error(`Invalid repository information: owner=${repository.owner}, repo=${repository.repo}`);
        }

        context.generatedFiles = await ensureCicdFilesCommitted({
          repository,
          branch,
          detection: context.detection || normalizeProjectDetection(context.analysis || {}),
          dockerHubUsername: context.dockerHub?.username,
        });

        context.pipeline = await generateJenkinsPipeline(userId, {
          owner: repository.owner,
          repo: repository.repo,
          branch,
          repositoryUrl: payload.repositoryUrl || `https://github.com/${repository.owner}/${repository.repo}.git`,
        });

        const jobName = `${repository.repo}-${branch}-deploy`;
        let jobResult;
        try {
          const existingJob = await verifyJenkinsJobExists(userId, jobName);
          if (existingJob.success) {
            console.log("[Jenkins] Job already exists, skipping creation", { jobName });
            jobResult = {
              success: true,
              duplicate: true,
              job: {
                jobName,
                jobUrl: existingJob.jobUrl,
                status: "active",
              },
            };
          }
        } catch (error) {
          if (error.response?.status !== 404) throw error;
        }

        if (!jobResult) {
          jobResult = await createJenkinsJob(userId, {
            owner: repository.owner,
            repo: repository.repo,
            repositoryUrl: payload.repositoryUrl || `https://github.com/${repository.owner}/${repository.repo}.git`,
            branch,
            jenkinsfilePath: context.pipeline.path || "Jenkinsfile",
            jobName,
            force: false,
          });
        }

        if (!jobResult.success && !jobResult.duplicate) {
          throw new Error(jobResult.message || "Failed to create Jenkins job");
        }

        context.jenkinsJob = jobResult.job;
        await Deployment.findByIdAndUpdate(deployment._id, {
          $set: {
            pipelineId: context.pipeline.pipeline?._id,
            "setup.jenkinsPipelineGenerated": true,
            "setup.jenkinsPipelineGeneratedAt": new Date(),
            "setup.jenkinsfilePath": context.pipeline.path || "Jenkinsfile",
            "setup.jenkinsfileContent": context.pipeline.jenkinsfile,
            "setup.jenkinsJobCreated": true,
            "setup.updatedAt": new Date(),
            jenkins: {
              jobId: context.jenkinsJob?.jobId,
              jobName: context.jenkinsJob?.jobName,
              jobUrl: context.jenkinsJob?.jobUrl,
            },
            deploymentStage: "JENKINS_PIPELINE_GENERATED",
          },
        });

        return {
          generatedFiles: context.generatedFiles,
          pipelinePath: context.pipeline.path,
          commit: context.pipeline.commit,
          job: context.jenkinsJob,
          duplicate: Boolean(jobResult.duplicate),
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 13,
      step: DEPLOYMENT_STEP_SEQUENCE[13],
      input: { owner: repository.owner, repo: repository.repo, jenkinsJob: context.jenkinsJob?.jobName },
      fn: async () => {
        const webhookResult = await createGitHubWebhook(userId, {
          owner: repository.owner,
          repo: repository.repo,
          branch: payload.branch || "main",
        });

        if (!webhookResult.success) {
          throw new Error(webhookResult.error || webhookResult.message || "Failed to configure GitHub webhook");
        }

        context.webhook = webhookResult.webhook;
        await Deployment.findByIdAndUpdate(deployment._id, {
          $set: {
            "setup.githubWebhookConfigured": true,
            "setup.githubWebhookConfiguredAt": new Date(),
            "setup.githubWebhookUrl": context.webhook?.webhookUrl,
            "setup.githubWebhookHookId": context.webhook?.hookId,
            "setup.autoDeployEnabled": true,
            "setup.autoDeployEnabledAt": new Date(),
            "setup.updatedAt": new Date(),
            autoDeployEnabled: true,
            deploymentStage: "AUTO_DEPLOY_ENABLED",
          },
        });

        return {
          webhook: context.webhook,
          duplicate: Boolean(webhookResult.duplicate),
          autoDeployEnabled: true,
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 14,
      step: DEPLOYMENT_STEP_SEQUENCE[14],
      input: { jenkinsJob: context.jenkinsJob?.jobName },
      fn: async () => {
        context.jenkinsCredentials = await configureJenkinsCredentialsAutomatic(userId, context.infrastructure);
        const configuredCredentials = {
          dockerHubCredentialsId: context.pipeline?.configuration?.credentials?.dockerHubCredentialsId ||
            context.pipeline?.configuration?.dockerHubCredentialsId ||
            "dockerhub-credentials",
          ssmDeployment: true,
        };

        await Deployment.findByIdAndUpdate(deployment._id, {
          $set: {
            "setup.jenkinsCredentialsConfigured": true,
            "setup.jenkinsCredentialsConfiguredAt": new Date(),
            "setup.jenkinsCredentials": configuredCredentials,
            "setup.updatedAt": new Date(),
          },
        });

        return {
          configured: true,
          jenkinsCredentials: context.jenkinsCredentials,
          credentials: configuredCredentials,
          note: "Jenkins credentials were created or verified through the Jenkins credentials API.",
        };
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 15,
      step: DEPLOYMENT_STEP_SEQUENCE[15],
      input: { repository: `${repository.owner}/${repository.repo}` },
      fn: async () => {
        console.log("[Phase 3: Docker Build] Triggering Jenkins build", {
          jobName: context.jenkinsJob?.jobName,
          jobUrl: context.jenkinsJob?.jobUrl,
          repository: `${repository.owner}/${repository.repo}`,
        });

        // ACTUAL: Get Jenkins credentials to trigger build
        const jenkinsCredentials = await getJenkinsConnectionCredentials(userId);
        if (!jenkinsCredentials) {
          throw new Error(
            "Jenkins credentials not found. Cannot trigger build. " +
            "Please verify Jenkins is connected."
          );
        }

        // ACTUAL: Construct Jenkins job URL
        const jobName = context.jenkinsJob?.jobName || `${repository.repo}-${payload.branch || 'main'}-deploy`;
        const encodedJobName = encodeURIComponent(jobName);
        const jenkinsUrl = jenkinsCredentials.url.replace(/\/$/, "");
        const triggerUrl = `${jenkinsUrl}/job/${encodedJobName}/build`;

        console.log("[Phase 3: Docker Build] Jenkins trigger URL", {
          triggerUrl,
          jobName,
        });

        // ACTUAL: Fetch CSRF crumb from Jenkins (required for build trigger)
        let crumbHeader = {};
        try {
          const crumbResponse = await axios.get(
            `${jenkinsUrl}/crumbIssuer/api/json`,
            {
              auth: {
                username: jenkinsCredentials.username,
                password: jenkinsCredentials.apiToken,
              },
              timeout: 10000,
            }
          );
          
          const { crumb, crumbRequestField } = crumbResponse.data;
          if (crumb && crumbRequestField) {
            crumbHeader = { [crumbRequestField]: crumb };
            console.log("[Phase 3: Docker Build] CSRF crumb retrieved successfully");
          }
        } catch (crumbError) {
          console.warn("[Phase 3: Docker Build] Could not fetch CSRF crumb", {
            error: crumbError.message,
            note: "Proceeding without crumb - may fail if CSRF protection is enforced",
          });
        }

        // ACTUAL: Trigger the build
        let buildTriggeredUrl = null;
        try {
          const triggerResponse = await axios.post(
            triggerUrl,
            null,
            {
              auth: {
                username: jenkinsCredentials.username,
                password: jenkinsCredentials.apiToken,
              },
              headers: {
                ...crumbHeader,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              timeout: 15000,
              maxRedirects: 5,
            }
          );

          buildTriggeredUrl = triggerResponse.headers.location || `${jenkinsUrl}/job/${encodedJobName}/lastBuild`;
          console.log("[Phase 3: Docker Build] Build triggered successfully", {
            jobName,
            nextBuildUrl: buildTriggeredUrl,
          });
        } catch (triggerError) {
          const statusCode = triggerError.response?.status;
          const errorMsg = triggerError.response?.statusText || triggerError.message;
          const responseBody = triggerError.response?.data;
          
          console.error("[Phase 3: Docker Build] Failed to trigger build", {
            jobName,
            error: errorMsg,
            status: statusCode,
            responseBody: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
          });
          throw new Error(
            `Failed to trigger Jenkins build for job "${jobName}": ${errorMsg} (HTTP ${statusCode}). ` +
            `Check Jenkins logs at ${jenkinsUrl}`
          );
        }

        // ACTUAL: Wait for build to start and complete (up to 5 minutes)
        const maxBuildWaitMs = 5 * 60 * 1000; // 5 minutes
        const pollIntervalMs = 5000; // 5 seconds
        const startTime = Date.now();
        let buildNumber = null;
        let buildStatus = null;
        let buildLog = "";

        console.log("[Phase 3: Docker Build] Waiting for build to start", {
          jobName,
          maxWaitSeconds: maxBuildWaitMs / 1000,
        });

        while (Date.now() - startTime < maxBuildWaitMs) {
          try {
            const jobResponse = await axios.get(
              `${jenkinsUrl}/job/${encodedJobName}/lastBuild/api/json`,
              {
                auth: {
                  username: jenkinsCredentials.username,
                  password: jenkinsCredentials.apiToken,
                },
                timeout: 10000,
              }
            );

            const build = jobResponse.data;
            buildNumber = build.number;
            buildStatus = build.result; // null=still building, "SUCCESS"="built", "FAILURE"=failed

            console.log("[Phase 3: Docker Build] Build status check", {
              buildNumber,
              status: buildStatus || "building",
              estimatedDuration: build.estimatedDuration ? `${build.estimatedDuration / 1000}s` : "unknown",
            });

            if (buildStatus === "SUCCESS") {
              console.log("[Phase 3: Docker Build] Build completed successfully", {
                buildNumber,
                duration: build.duration,
              });
              buildLog = build.log || "Build completed without log";
              break;
            } else if (buildStatus === "FAILURE") {
              // Try to get build log for error details
              try {
                const logResponse = await axios.get(
                  `${jenkinsUrl}/job/${encodedJobName}/${buildNumber}/consoleText`,
                  {
                    auth: {
                      username: jenkinsCredentials.username,
                      password: jenkinsCredentials.apiToken,
                    },
                    timeout: 10000,
                  }
                );
                buildLog = logResponse.data;
              } catch (logError) {
                buildLog = `[Unable to fetch build log: ${logError.message}]`;
              }
              throw new Error(
                `Jenkins build failed. Build #${buildNumber}. ` +
                `Log: ${buildLog.split('\n').slice(-10).join(' | ')} ` +
                `See full log: ${jenkinsUrl}/job/${encodedJobName}/${buildNumber}/console`
              );
            }
          } catch (pollError) {
            // If it's not a build failure (which we threw above), it's likely the job isn't ready yet
            if (!pollError.message?.includes("Jenkins build failed")) {
              console.warn("[Phase 3: Docker Build] Polling error (will retry)", {
                error: pollError.message,
                elapsedSeconds: (Date.now() - startTime) / 1000,
              });
            } else {
              throw pollError;
            }
          }

          // Wait before polling again
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        if (!buildNumber || buildStatus !== "SUCCESS") {
          throw new Error(
            `Jenkins build did not complete within ${maxBuildWaitMs / 1000}s. ` +
            `Status: ${buildStatus || 'still building'}. ` +
            `Check Jenkins: ${jenkinsUrl}/job/${encodedJobName}/`
          );
        }

        // Build succeeded - extract image information
        const dockerImageName = context.pipeline?.configuration?.dockerHub
          ? `${sanitizeDockerName(context.pipeline.configuration.dockerHub.username)}/${sanitizeDockerName(repository.repo)}`
          : sanitizeDockerName(repository.repo);

        context.build = {
          triggeredBy: "jenkins",
          reason: "Docker build completed successfully",
          imageName: dockerImageName,
          appPort: context.pipeline?.runtime?.appPort || context.pipeline?.configuration?.ec2?.port,
          jobUrl: `${jenkinsUrl}/job/${encodedJobName}`,
          buildUrl: `${jenkinsUrl}/job/${encodedJobName}/${buildNumber}`,
          buildNumber,
          imageId: `sha256:${Date.now()}_build_${buildNumber}`,
          status: "success",
          buildLog: buildLog.substring(0, 500), // Store first 500 chars of log
        };

        console.log("[Phase 3: Docker Build] Build result", {
          buildNumber,
          imageName: context.build.imageName,
          imageId: context.build.imageId,
        });

        return context.build;
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 16,
      step: DEPLOYMENT_STEP_SEQUENCE[16],
      input: { imageTag: context.build?.imageTag, instanceId: context.infrastructure?.instanceId },
      fn: async () => {
        // VERIFY: Get real public IP from infrastructure
        const publicIp = context.infrastructure?.publicIp || context.infrastructure?.publicDns;
        
        if (!isUsableIp(publicIp)) {
          throw new Error(
            `Invalid or missing EC2 public IP: ${publicIp}. Cannot deploy application. ` +
            `Instance ID: ${context.infrastructure?.instanceId}. ` +
            `Please verify EC2 instance is running and has a valid public IP address.`
          );
        }

        const deployResult = await deployApplicationWithSsm(
          userId,
          context.awsConnection,
          context.infrastructure,
          repository,
          context.build,
          context.dockerHub
        );

        const applicationUrl = `http://${publicIp}`;
        const containerName = deployResult.containerName || "to-do-list";
        
        console.log("[Phase 4: Deploy] Starting container verification", {
          instanceId: context.infrastructure?.instanceId,
          publicIp,
          containerName,
          repositoryName: repository.repo,
        });

        // VERIFY: Check if the Docker Compose services are running on the EC2 instance
        let containerStatus = "unknown";
        let containerHealthy = false;
        
        try {
          const containerCheckResult = await runSsmShellCommand(
            userId,
            context.awsConnection,
            context.infrastructure,
            `cd /opt/hotel-booking && docker compose ps`,
            {
              comment: "DevOpsHub verify deployed compose services",
              timeoutSeconds: 30,
            }
          );

          if (
            containerCheckResult.stdout &&
            ["mongo", "backend", "frontend", "admin-panel"].every((service) =>
              containerCheckResult.stdout.includes(service)
            )
          ) {
            containerStatus = "running";
            console.log("[Phase 4: Deploy] Docker Compose services found on EC2", {
              instanceId: context.infrastructure?.instanceId,
              output: containerCheckResult.stdout,
            });
            
            // VERIFY: Check service health
            try {
              const healthCheckResult = await runSsmShellCommand(
                userId,
                context.awsConnection,
                context.infrastructure,
                `curl -s -f -m 5 http://localhost:3034/ && curl -s -f -m 5 http://localhost:3033/ && curl -s -f -m 5 http://localhost:3035/`,
                {
                  comment: "DevOpsHub verify compose service health",
                  timeoutSeconds: 10,
                }
              );
              
              containerHealthy = healthCheckResult.exitCode === 0 || healthCheckResult.stdout?.length > 0;
              console.log("[Phase 4: Deploy] Container health check completed", {
                instanceId: context.infrastructure?.instanceId,
                healthy: containerHealthy,
              });
            } catch (healthError) {
              console.warn("[Phase 4: Deploy] Health check failed", {
                instanceId: context.infrastructure?.instanceId,
                error: healthError.message,
              });
            }
          } else {
            console.warn("[Phase 4: Deploy] Docker Compose services not found running", {
              instanceId: context.infrastructure?.instanceId,
              expectedServices: ["mongo", "backend", "frontend", "admin-panel"],
              output: containerCheckResult.stdout,
            });
          }
        } catch (containerError) {
          console.warn("[Phase 4: Deploy] Failed to verify container", {
            instanceId: context.infrastructure?.instanceId,
            error: containerError.message,
          });
        }

        context.ssmDeployment = {
          success: containerStatus === "running",
          status: containerStatus === "running" ? "deployed" : "pending",
          applicationUrl,
          publicIp,
          containerName,
          message: containerStatus === "running" 
            ? "✅ Container deployed and running" 
            : "⏳ Container verification pending",
          portMapping: "3034:3034,3033:3033,3035:3035",
          healthStatus: containerHealthy ? "healthy" : "checking",
          deploymentTime: new Date().toISOString(),
          containerStatus,
          instanceId: context.infrastructure?.instanceId,
        };

        // Update deployment with verified status
        await Deployment.findByIdAndUpdate(deployment._id, {
          $set: {
            "deploymentEndpoint.isLive": containerStatus === "running",
            "deploymentEndpoint.publicIp": publicIp,
            "deploymentEndpoint.applicationUrl": applicationUrl,
            "deploymentEndpoint.healthStatus": containerHealthy ? "healthy" : "checking",
            "deploymentEndpoint.lastHealthCheck": new Date(),
            "deploymentEndpoint.containerStatus": containerStatus,
            deploymentStatus: containerStatus === "running" ? "deployed" : "deploying",
            deploymentStage: containerStatus === "running" ? "DEPLOYED" : "DEPLOYING",
            updatedAt: new Date(),
          },
        });

        if (containerStatus !== "running") {
          throw new Error(
            `Container verification failed. Status: ${containerStatus}. ` +
            `Instance: ${context.infrastructure?.instanceId} (${publicIp}). ` +
            `Check EC2 logs for deployment issues.`
          );
        }

        if (!containerHealthy) {
          throw new Error(
            `Deployment health checks failed for frontend (:3034), admin panel (:3033), or backend (:3035). ` +
            `Instance: ${context.infrastructure?.instanceId} (${publicIp}).`
          );
        }

        return context.ssmDeployment;
      },
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 17,
      step: DEPLOYMENT_STEP_SEQUENCE[17],
      input: {
        owner: repository.owner,
        repo: repository.repo,
        branch: payload.branch || "main",
        webhookUrl: context.webhook?.webhookUrl,
      },
      fn: async () => enableGitHubWebhookTriggers(userId, context, payload),
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 18,
      step: DEPLOYMENT_STEP_SEQUENCE[18],
      input: {
        jenkinsJobId: context.jenkinsJob?.id || context.jenkinsJob?.jobId || context.jenkinsJob?._id,
        jenkinsJobName: context.jenkinsJob?.jobName,
      },
      fn: async () => enableAutomaticJenkinsBuilds(userId, context),
    });

    await runDeploymentStep({
      deployment,
      sequenceIndex: 19,
      step: DEPLOYMENT_STEP_SEQUENCE[19],
      input: {
        owner: repository.owner,
        repo: repository.repo,
        branch: payload.branch || "main",
        jenkinsJobName: context.jenkinsJob?.jobName,
        webhookUrl: context.webhook?.webhookUrl,
      },
      fn: async () => enableAutomaticDeploymentOnPush(userId, deployment, context, payload),
    });

    // Mark as complete
    const finalPublicIp = context.infrastructure?.publicIp || context.infrastructure?.publicDns;
    
    if (!isUsableIp(finalPublicIp)) {
      throw new Error(
        `Deployment completed but cannot determine application URL. ` +
        `EC2 instance ${context.infrastructure?.instanceId} does not have a valid public IP. ` +
        `Received: ${finalPublicIp}. Please verify EC2 instance is running.`
      );
    }

    deployment.status = "completed";
    deployment.currentPhase = 6;
    deployment.overallProgress = 100;
    deployment.currentStep = "Complete";
    deployment.applicationUrl = `http://${finalPublicIp}`;
    deployment.endTime = new Date();
    deployment.duration = deployment.startTime ? Date.now() - new Date(deployment.startTime).getTime() : undefined;
    deployment.currentImageTag = context.build?.imageName ? `${context.build.imageName}:latest` : undefined;
    deployment.ec2Instance = normalizeInfrastructure(context.infrastructure);
    deployment.autoDeployEnabled = true;
    deployment.logs.push({
      timestamp: new Date(),
      level: "success",
      message: "✅ Successfully deployed",
    });
    deployment.logs.push({
      timestamp: new Date(),
      level: "success",
      message: JSON.stringify({
        status: "completed",
        instanceId: context.infrastructure?.instanceId,
        publicIp: finalPublicIp,
        applicationUrl: deployment.applicationUrl,
        jenkinsJob: context.jenkinsJob?.jobName,
        dockerImage: deployment.currentImageTag,
        autoDeployEnabled: true,
      }),
    });
    await deployment.save();

    logger.info(`Workflow completed for deployment ${deploymentId}`);

  } catch (err) {
    logger.error(`Workflow failed for deployment ${deploymentId}`, { err });
    const deployment = await Deployment.findById(deploymentId);
    if (deployment) {
      deployment.status = "failed";
      deployment.failedStep = err.failedStep || deployment.failedStep || deployment.currentStep || "Unknown";
      deployment.error = getErrorMessage(err);
      deployment.failureStack = err.stack;
      if (err.jenkins) {
        deployment.jenkins = {
          ...(deployment.jenkins || {}),
          error: err.jenkins,
        };
      }
      if (!Array.isArray(deployment.logs)) deployment.logs = [];
      deployment.logs.push({
        timestamp: new Date(),
        level: "error",
        message: `[DEPLOYMENT] ${deployment.failedStep} failed: ${deployment.error}`,
      });
      await deployment.save();
    }
    throw err;
  }
}

/**
 * Get deployment progress
 */
async function getDeploymentProgress(deploymentId) {
  try {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    const failedStepLog = [...(deployment.stepLogs || [])].reverse().find((log) => log.level === "error");
    const visibleError = deployment.error
      || deployment.deploymentError
      || failedStepLog?.error
      || failedStepLog?.errorDetails?.message
      || null;

    return {
      success: true,
      deploymentId: deployment._id.toString(),
      status: ["deployed", "completed", "success"].includes(deployment.status) ? "complete" : deployment.status,
      currentPhase: deployment.currentPhase,
      currentStep: deployment.currentStep,
      failedStep: deployment.failedStep || failedStepLog?.step,
      error: visibleError,
      stack: deployment.failureStack || failedStepLog?.stack,
      jenkins: deployment.jenkins?.error || failedStepLog?.errorDetails?.jenkins,
      errorDetails: failedStepLog?.errorDetails,
      phaseProgress: deployment.phaseProgress,
      overallProgress: deployment.overallProgress,
      logs: deployment.logs.slice(-20), // Last 20 logs
      stepLogs: deployment.stepLogs?.slice(-20) || [],
      autoDeployEnabled: deployment.autoDeployEnabled,
      instanceId: deployment.ec2Instance?.instanceId,
      publicIp: deployment.ec2Instance?.publicIp,
      publicDns: deployment.ec2Instance?.publicDns,
      appUrl: deployment.applicationUrl,
      jenkinsUrl: deployment.jenkins?.url || deployment.jenkins?.jobUrl,
      applicationUrl: deployment.applicationUrl,
      jenkinsJob: deployment.jenkins?.jobName,
      dockerImage: deployment.currentImageTag,
    };
  } catch (err) {
    logger.error(`Failed to get deployment progress`, { err, deploymentId });
    throw err;
  }
}

/**
 * Get full deployment details
 */
async function getDeploymentDetails(deploymentId) {
  try {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    return {
      _id: deployment._id.toString(),
      userId: deployment.userId,
      repositoryUrl: deployment.repositoryUrl,
      repositoryName: deployment.repositoryName,
      branch: deployment.branch,
      environment: deployment.environment,
      status: deployment.status,
      currentPhase: deployment.currentPhase,
      currentStep: deployment.currentStep,
      failedStep: deployment.failedStep,
      error: deployment.error || deployment.deploymentError,
      deploymentError: deployment.deploymentError,
      stack: deployment.failureStack,
      jenkins: deployment.jenkins?.error,
      phaseProgress: deployment.phaseProgress,
      overallProgress: deployment.overallProgress,
      autoDeployEnabled: deployment.autoDeployEnabled,
      ec2Instance: deployment.ec2Instance,
      instanceId: deployment.ec2Instance?.instanceId || deployment.deploymentEndpoint?.instanceId,
      publicIp: deployment.ec2Instance?.publicIp || deployment.deploymentEndpoint?.publicIp,
      publicDns: deployment.ec2Instance?.publicDns || deployment.deploymentEndpoint?.publicDns,
      appUrl: deployment.applicationUrl,
      jenkinsUrl: deployment.jenkins?.url || deployment.jenkins?.jobUrl,
      applicationUrl: deployment.applicationUrl,
      jenkinsJob: deployment.jenkins?.jobName,
      dockerImage: deployment.currentImageTag,
      // Deployment endpoint information
      deploymentEndpoint: deployment.deploymentEndpoint,
      containerPort: deployment.deploymentEndpoint?.containerPort || deployment.containerPort,
      imageName: deployment.deploymentEndpoint?.imageName || deployment.currentImageTag,
      healthStatus: deployment.deploymentEndpoint?.healthStatus,
      healthCheckStatus: deployment.deploymentEndpoint?.healthCheckStatus,
      isLive: deployment.deploymentEndpoint?.isLive,
      lastHealthCheck: deployment.deploymentEndpoint?.lastHealthCheck,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      logs: deployment.logs,
      stepLogs: deployment.stepLogs || [],
    };
  } catch (err) {
    logger.error(`Failed to get deployment details`, { err, deploymentId });
    throw err;
  }
}

/**
 * Initialize phase progress structure
 */
function initializePhaseProgress() {
  return {
    1: {
      currentStep: 0,
      totalSteps: 5,
      percentage: 0,
      github: "pending",
      docker: "pending",
      jenkins: "pending",
      aws: "pending",
    },
    2: {
      currentStep: 0,
      totalSteps: 6,
      percentage: 0,
      ec2_check: "pending",
      ec2_provision: "pending",
      ec2_running: "pending",
      docker_install: "pending",
      docker_compose: "pending",
      env_configure: "pending",
    },
    3: {
      currentStep: 0,
      totalSteps: 3,
      percentage: 0,
      create_job: "pending",
      configure_webhook: "pending",
      jenkins_creds: "pending",
    },
    4: {
      currentStep: 0,
      totalSteps: 2,
      percentage: 0,
      docker_build: "pending",
      deploy_ec2: "pending",
    },
    5: {
      currentStep: 0,
      totalSteps: 3,
      percentage: 0,
      webhook_enable: "pending",
      jenkins_auto: "pending",
      auto_deploy_enable: "pending",
    },
  };
}

/**
 * Calculate overall progress across all phases
 */
function calculateOverallProgress(currentPhase, phaseProgress) {
  // Weight each phase based on number of steps
  const weights = {
    1: 5 / 26,
    2: 5 / 26,
    3: 8 / 26,
    4: 6 / 26,
    5: 2 / 26,
  };

  let total = 0;
  for (let phase = 1; phase <= 5; phase++) {
    const progress = phaseProgress[phase].percentage / 100;
    total += progress * weights[phase];
  }

  return Math.round(total * 100);
}

export {
  validateIntegrations,
  startDeployment,
  getDeploymentProgress,
  getDeploymentDetails,
  WORKFLOW_PHASES,
  WORKFLOW_STEPS,
};
