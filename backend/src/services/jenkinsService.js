import axios from "axios";
import { BuildHistory } from "../models/BuildHistory.js";
import { Log } from "../models/Logs.js";
import { isDbConnected } from "../db.js";
import { createAlert } from "./alertService.js";
import {
  emitJenkinsBuildStarted,
  emitJenkinsBuildCompleted,
  emitNewLog,
} from "./socketEventsService.js";

const JENKINS_URL = process.env.JENKINS_URL || "http://localhost:8080";
const JENKINS_USERNAME = process.env.JENKINS_USER || process.env.JENKINS_USERNAME || "admin";
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || "";
const JENKINS_JOB_NAME = process.env.JENKINS_JOB_NAME || "devops-hub-deploy";
const JENKINS_AUTO_CREATE_JOB = process.env.JENKINS_AUTO_CREATE_JOB !== "false";

function normalizeJenkinsBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function buildJenkinsEndpoint(path, params = {}) {
  const cleanBase = normalizeJenkinsBaseUrl(JENKINS_URL);
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(`${cleanBase}/${cleanPath}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function responseBodyToString(data) {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch (_error) {
    return String(data);
  }
}

function logJenkinsRequest({ endpoint, jobName, response, responseBody }) {
  console.log(
    `[JENKINS]\n` +
      `Base URL: ${normalizeJenkinsBaseUrl(JENKINS_URL)}\n` +
      `Endpoint: ${endpoint || ""}\n` +
      `Job Name: ${jobName || ""}\n` +
      `Response Code: ${response?.status ?? ""}\n` +
      `Response Body: ${responseBodyToString(responseBody !== undefined ? responseBody : response?.data)}`
  );
}

// Jenkins availability tracking
let jenkinsAvailable = null;
let jenkinsCheckTime = 0;
const JENKINS_CHECK_INTERVAL = 30000; // 30 seconds
const JENKINS_RETRY_CONFIG = {
  maxRetries: 2,
  retryDelays: [500, 1500], // Faster backoff: 0.5s, 1.5s
  timeout: 4000, // 4 seconds - quick timeout to prevent frontend timeouts
};

// Response caching to avoid repeated slow requests
let cachedPipelineStatus = null;
let cachedStatusTime = 0;
const CACHE_DURATION = 30000; // Cache for 30 seconds

/**
 * Jenkins Connection Validator - Check if Jenkins is reachable
 */
export async function isJenkinsAvailable() {
  const now = Date.now();
  
  // Use cached result if recent (30 seconds)
  if (jenkinsAvailable !== null && (now - jenkinsCheckTime) < JENKINS_CHECK_INTERVAL) {
    return jenkinsAvailable;
  }

  try {
    // Validate configuration
    if (!JENKINS_URL) {
      console.warn("⚠️  [Jenkins] JENKINS_URL not configured");
      jenkinsAvailable = false;
      jenkinsCheckTime = now;
      return false;
    }

    if (!JENKINS_TOKEN) {
      console.warn("⚠️  [Jenkins] JENKINS_TOKEN not configured");
      jenkinsAvailable = false;
      jenkinsCheckTime = now;
      return false;
    }

    // Try to connect to Jenkins
    const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_TOKEN}`).toString("base64");
    const response = await axios.get(`${JENKINS_URL}/api/json`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: JENKINS_RETRY_CONFIG.timeout,
    });

    if (response.status === 200) {
      console.log("✅ [Jenkins] Connected successfully");
      jenkinsAvailable = true;
      jenkinsCheckTime = now;
      return true;
    }
  } catch (error) {
    console.warn("❌ [Jenkins] Connection failed:", error.message);
    jenkinsAvailable = false;
    jenkinsCheckTime = now;
    return false;
  }
}

/**
 * Initialize Jenkins connection check on server startup
 */
export async function initializeJenkinsCheck() {
  try {
    console.log("🔍 [Jenkins] Checking Jenkins server availability...");
    
    // Validate configuration first
    if (!JENKINS_URL) {
      console.warn("⚠️  [Jenkins] JENKINS_URL environment variable not set");
      console.warn("   Set JENKINS_URL in .env: JENKINS_URL=http://jenkins.example.com:8080");
      return false;
    }

    if (!JENKINS_TOKEN) {
      console.warn("⚠️  [Jenkins] JENKINS_TOKEN environment variable not set");
      console.warn("   Set JENKINS_TOKEN in .env with your Jenkins API token");
      return false;
    }

    if (!JENKINS_USERNAME) {
      console.warn("⚠️  [Jenkins] JENKINS_USERNAME environment variable not set");
      console.warn("   Set JENKINS_USER or JENKINS_USERNAME in .env");
      return false;
    }

    const available = await isJenkinsAvailable();
    
    if (available) {
      console.log(`✅ [Jenkins] Server is ready at ${JENKINS_URL}`);
      console.log(`   Job: ${JENKINS_JOB_NAME}`);
      console.log(`   User: ${JENKINS_USERNAME}`);
      return true;
    } else {
      console.warn(`⚠️  [Jenkins] Server unavailable at ${JENKINS_URL}`);
      console.warn("   Deployment tracking will use mock data until Jenkins is available");
      return false;
    }
  } catch (error) {
    console.error("❌ [Jenkins] Initialization error:", error.message);
    return false;
  }
}

/**
 * Retry mechanism for Jenkins API requests
 */
export async function makeJenkinsRequestWithRetry(
  fn,
  description = "Jenkins API request",
  retries = JENKINS_RETRY_CONFIG.maxRetries
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      if (isLastAttempt) {
        console.error(`❌ [Jenkins] ${description} failed after ${retries + 1} attempts:`, error.message);
        throw error;
      }

      const delay = JENKINS_RETRY_CONFIG.retryDelays[attempt] || JENKINS_RETRY_CONFIG.retryDelays[retries];
      console.warn(`⚠️  [Jenkins] ${description} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Create Jenkins API client with proper headers and auth
 */
function getJenkinsClient() {
  const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_TOKEN}`).toString("base64");
  
  return axios.create({
    baseURL: JENKINS_URL,
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": "DevOps-Dashboard",
    },
    timeout: JENKINS_RETRY_CONFIG.timeout,
  });
}

/**
 * Get mock build data for development/testing
 */
function getMockBuildData(buildNumber = 1) {
  const stages = [
    { name: "Checkout", status: "SUCCESS", startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() - 55000), duration: 5000 },
    { name: "Build", status: "SUCCESS", startTime: new Date(Date.now() - 55000), endTime: new Date(Date.now() - 35000), duration: 20000 },
    { name: "Test", status: "SUCCESS", startTime: new Date(Date.now() - 35000), endTime: new Date(Date.now() - 15000), duration: 20000 },
    { name: "Deploy", status: buildNumber % 3 === 0 ? "RUNNING" : "SUCCESS", startTime: new Date(Date.now() - 15000), endTime: buildNumber % 3 === 0 ? null : new Date(), duration: buildNumber % 3 === 0 ? Date.now() - Date.now() + 15000 : 8000 },
  ];
  
  return {
    buildNumber,
    jobName: JENKINS_JOB_NAME,
    buildUrl: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}/${buildNumber}/`,
    displayName: `Build #${buildNumber}`,
    status: buildNumber % 3 === 0 ? "RUNNING" : (buildNumber % 5 === 0 ? "FAILURE" : "SUCCESS"),
    inProgress: buildNumber % 3 === 0,
    stages,
    timestamp: new Date(Date.now() - 60000),
    duration: buildNumber % 3 === 0 ? null : 53000,
    estimatedDuration: 60000,
    logs: {
      full: `Build Log for #${buildNumber}\n[INFO] Building project...\n[INFO] Compiling sources...\n[SUCCESS] Build completed successfully.`,
      tail: `[SUCCESS] Build completed successfully.`,
    },
    artifacts: [
      { name: "app.jar", size: 5242880, url: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}/${buildNumber}/artifact/app.jar` }
    ],
    sourceCode: {
      repository: "devops-hub",
      branch: buildNumber % 2 === 0 ? "main" : "develop",
      commit: `abc${buildNumber}def`,
      commitMessage: `Deployment build #${buildNumber}`,
      author: "Developer",
      authorEmail: "dev@example.com",
    },
  };
}

/**
 * Check if Jenkins is properly configured
 */
function isJenkinsConfigured() {
  // For development, allow mock mode if JENKINS_TOKEN starts with "mock-"
  if (JENKINS_TOKEN === "mock-mode" || JENKINS_TOKEN?.startsWith("mock-")) {
    console.log("🎭 [Jenkins] Running in MOCK MODE for development");
    return true;
  }
  
  if (!JENKINS_TOKEN || JENKINS_TOKEN === "your-jenkins-api-token") {
    console.warn("⚠️  [Jenkins] Jenkins token not configured. Set JENKINS_TOKEN environment variable.");
    console.warn("   For development testing, set JENKINS_TOKEN=mock-mode");
    return false;
  }
  return true;
}

/**
 * Get axios instance with Jenkins auth (uses both methods for compatibility)
 */
function getJenkinsAxios() {
  // Use Header-based auth for consistency with getJenkinsClient
  return axios.create({
    baseURL: JENKINS_URL,
    headers: {
      Authorization: `Basic ${Buffer.from(`${JENKINS_USERNAME}:${JENKINS_TOKEN}`).toString("base64")}`,
      "User-Agent": "DevOps-Dashboard",
    },
    timeout: JENKINS_RETRY_CONFIG.timeout,
  });
}

function formatJenkinsError(error) {
  if (error.response?.status === 401) {
    return `Jenkins authentication failed for user "${JENKINS_USERNAME}". Create a Jenkins API token for that exact user and update JENKINS_USERNAME/JENKINS_TOKEN in backend/.env.`;
  }

  if (error.response?.status === 404) {
    return `Jenkins job "${JENKINS_JOB_NAME}" was not found at ${JENKINS_URL}. Create that job in Jenkins or update JENKINS_JOB_NAME in backend/.env to an existing job name.`;
  }

  if (error.response?.status === 403) {
    return `Jenkins rejected the request for user "${JENKINS_USERNAME}". Check API token permissions, CSRF settings, and job permissions.`;
  }

  if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") {
    return `Cannot reach Jenkins at ${JENKINS_URL}. Check the EC2 security group, Jenkins URL, and port 8080.`;
  }

  return error.message;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeProjectName(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
}

function getQueueItemId(location) {
  const match = String(location || "").match(/\/queue\/item\/(\d+)\/?/);
  return match ? Number(match[1]) : null;
}

async function waitForQueueExecutable(client, queueId, timeoutMs = 30000) {
  if (!queueId) return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await client.get(`/queue/item/${queueId}/api/json`);
    if (response.data?.executable?.number) {
      return response.data.executable.number;
    }

    if (response.data?.cancelled) {
      throw new Error(response.data?.why || `Jenkins queue item ${queueId} was cancelled`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return null;
}

async function getJenkinsCrumbHeaders(client) {
  try {
    const response = await client.get("/crumbIssuer/api/json");
    return {
      [response.data.crumbRequestField]: response.data.crumb,
    };
  } catch (error) {
    console.warn("âš ï¸  [Jenkins] Crumb unavailable, continuing without CSRF crumb:", error.message);
    return {};
  }
}

function createGenericPipelineConfigXml() {
  const pipelineScript = `
pipeline {
  agent any
  parameters {
    string(name: 'REPO_URL', defaultValue: '', description: 'Git repository URL')
    string(name: 'REPO_NAME', defaultValue: 'app', description: 'Repository name')
    string(name: 'PROJECT_NAME', defaultValue: 'app', description: 'Docker Compose project or container name')
    string(name: 'BRANCH', defaultValue: 'main', description: 'Git branch')
    string(name: 'COMMIT_SHA', defaultValue: '', description: 'Commit SHA')
    string(name: 'BUILD_FILE_PATH', defaultValue: 'auto', description: 'auto, compose file, or Dockerfile')
    string(name: 'PORTS', defaultValue: '3000:3000', description: 'Comma-separated Docker port mappings for Dockerfile projects')
    string(name: 'ENVIRONMENT', defaultValue: 'production', description: 'Deployment environment')
  }
  stages {
    stage('Checkout') {
      steps {
        deleteDir()
        git branch: params.BRANCH, url: params.REPO_URL
      }
    }
    stage('Detect Build File') {
      steps {
        script {
          def requested = params.BUILD_FILE_PATH?.trim()
          if (requested && requested != 'auto') {
            env.BUILD_FILE = requested
          } else if (fileExists('docker-compose.yml')) {
            env.BUILD_FILE = 'docker-compose.yml'
          } else if (fileExists('docker-compose.yaml')) {
            env.BUILD_FILE = 'docker-compose.yaml'
          } else if (fileExists('compose.yml')) {
            env.BUILD_FILE = 'compose.yml'
          } else if (fileExists('compose.yaml')) {
            env.BUILD_FILE = 'compose.yaml'
          } else if (fileExists('Dockerfile')) {
            env.BUILD_FILE = 'Dockerfile'
          } else {
            error('No docker-compose.yml, compose.yml, or Dockerfile found in repository root')
          }
          echo "Using build file: \${env.BUILD_FILE}"
        }
      }
    }
    stage('Build and Deploy') {
      steps {
        script {
          def project = params.PROJECT_NAME
          def isCompose = env.BUILD_FILE == 'docker-compose.yml' || env.BUILD_FILE == 'docker-compose.yaml' || env.BUILD_FILE == 'compose.yml' || env.BUILD_FILE == 'compose.yaml'
          if (isCompose) {
            if (isUnix()) {
              sh "docker compose -f \${env.BUILD_FILE} -p \${project} down --remove-orphans || true"
              sh "docker compose -f \${env.BUILD_FILE} -p \${project} up -d --build --remove-orphans"
            } else {
              bat "docker compose -f %BUILD_FILE% -p \${project} down --remove-orphans"
              bat "docker compose -f %BUILD_FILE% -p \${project} up -d --build --remove-orphans"
            }
          } else {
            def image = "\${project}:\${env.BUILD_NUMBER}"
            if (isUnix()) {
              sh "docker build -f \${env.BUILD_FILE} -t \${image} ."
              sh "docker rm -f \${project} || true"
              sh "docker run -d --name \${project} -p \${params.PORTS.replace(',', ' -p ')} \${image}"
            } else {
              bat "docker build -f %BUILD_FILE% -t \${project}:%BUILD_NUMBER% ."
              bat "docker rm -f \${project}"
              bat "docker run -d --name \${project} -p \${params.PORTS.replace(',', ' -p ')} \${project}:%BUILD_NUMBER%"
            }
          }
        }
      }
    }
  }
}
`;

  return `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions/>
  <description>Generic auto-created CI/CD pipeline. Triggered by DevOps Dashboard webhooks.</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps">
    <script>${escapeXml(pipelineScript)}</script>
    <sandbox>true</sandbox>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>`;
}

async function ensureGenericPipelineJob(client) {
  if (!JENKINS_AUTO_CREATE_JOB) return;

  try {
    await client.get(`/job/${encodeURIComponent(JENKINS_JOB_NAME)}/api/json`);
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }

    console.log(`ðŸ§± [Jenkins] Creating generic pipeline job: ${JENKINS_JOB_NAME}`);
    const crumbHeaders = await getJenkinsCrumbHeaders(client);
    const endpoint = buildJenkinsEndpoint("/createItem", { name: JENKINS_JOB_NAME });
    try {
      const response = await client.post("/createItem", createGenericPipelineConfigXml(), {
        params: { name: JENKINS_JOB_NAME },
        headers: {
          ...crumbHeaders,
          "Content-Type": "application/xml",
        },
      });
      logJenkinsRequest({ endpoint, jobName: JENKINS_JOB_NAME, response });
    } catch (createError) {
      logJenkinsRequest({
        endpoint,
        jobName: JENKINS_JOB_NAME,
        response: createError.response,
        responseBody: createError.response?.data,
      });
      throw createError;
    }
  }
}

/**
 * Calculate build progress based on pipeline stages
 */
function calculateProgress(stages) {
  if (!stages || stages.length === 0) return 0;
  const completed = stages.filter(s => s.status === "SUCCESS").length;
  return Math.round((completed / stages.length) * 100);
}

/**
 * Trigger Jenkins Pipeline using API Token
 */
export const triggerJenkinsPipeline = async (webhookData, userId = "system") => {
  try {
    if (!isJenkinsConfigured()) {
      return {
        success: false,
        error: "Jenkins not configured - set JENKINS_TOKEN environment variable",
        buildNumber: null,
      };
    }

    // Mock mode: return simulated build trigger
    if (JENKINS_TOKEN === "mock-mode" || JENKINS_TOKEN?.startsWith("mock-")) {
      const buildNumber = Math.floor(Math.random() * 1000) + 1;
      const mockBuild = getMockBuildData(buildNumber);
      const repoName = webhookData.repository?.name || "unknown";
      
      // Store in MongoDB
      await BuildHistory.create({
        userId,
        buildNumber,
        jobName: JENKINS_JOB_NAME,
        status: "PENDING",
        displayName: `Build #${buildNumber}`,
        buildUrl: mockBuild.buildUrl,
        timestamp: new Date(),
        sourceCode: {
          repository: repoName,
          branch: webhookData.branch || "main",
          commit: webhookData.commit?.sha || "unknown",
          commitMessage: webhookData.commit?.message || "Triggered via API",
          author: webhookData.commit?.author?.name || "Unknown",
        },
        parameters: {
          REPO_NAME: webhookData.repository?.name || "unknown",
          COMMIT_SHA: webhookData.commit?.sha || "unknown",
          BRANCH: webhookData.branch || "main",
          ENVIRONMENT: webhookData.environment || "development",
        },
      });

      console.log(`✅ [Jenkins MOCK] Pipeline triggered. Build: ${buildNumber}`);
      
      // Emit Socket.io event
      emitJenkinsBuildStarted({
        buildNumber,
        jobName: JENKINS_JOB_NAME,
        branch: webhookData.branch || "main",
        commit: webhookData.commit?.sha || "unknown",
        author: webhookData.commit?.author?.name || "Unknown",
      });
      
      return {
        success: true,
        buildNumber,
        buildUrl: mockBuild.buildUrl,
      };
    }

    console.log(`🔄 [Jenkins] Triggering pipeline: ${JENKINS_JOB_NAME}`);

    const client = getJenkinsAxios();
    await ensureGenericPipelineJob(client);

    // Jenkins build endpoint
    const repoName = webhookData.repository?.name || "unknown";
    const params = {
      REPO_URL: webhookData.repository?.cloneUrl || webhookData.repository?.url || "",
      REPO_NAME: repoName,
      PROJECT_NAME: sanitizeProjectName(webhookData.projectName || repoName),
      COMMIT_SHA: webhookData.commit?.sha || "unknown",
      COMMIT_MESSAGE: webhookData.commit?.message || "Triggered via API",
      AUTHOR: webhookData.commit?.author?.name || "Unknown",
      BRANCH: webhookData.branch || "main",
      BUILD_FILE_PATH: webhookData.buildFilePath || process.env.WEBHOOK_BUILD_FILE_PATH || "auto",
      PORTS: webhookData.ports || process.env.WEBHOOK_CONTAINER_PORTS || "3000:3000",
      ENVIRONMENT: webhookData.environment || "development",
    };

    if (!params.REPO_URL) {
      throw new Error("Repository clone URL is required to trigger Jenkins");
    }

    const crumbHeaders = await getJenkinsCrumbHeaders(client);
    const response = await client.post(
      `/job/${JENKINS_JOB_NAME}/buildWithParameters`,
      null,
      {
        params,
        headers: {
          ...crumbHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Jenkins returns a queue item URL first; poll it until Jenkins assigns a build number.
    const location = response.headers.location;
    const queueId = getQueueItemId(location);
    const buildNumber = await waitForQueueExecutable(client, queueId);

    if (buildNumber) {
      console.log(`✅ [Jenkins] Pipeline triggered successfully. Build: ${buildNumber}`);

      // Store trigger event in MongoDB
      await BuildHistory.create({
        userId,
        buildNumber,
        jobName: JENKINS_JOB_NAME,
        status: "PENDING",
        displayName: `Build #${buildNumber}`,
        buildUrl: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}/${buildNumber}`,
        timestamp: new Date(),
        sourceCode: {
          repository: repoName,
          branch: webhookData.branch || "main",
          commit: webhookData.commit?.sha || "unknown",
          commitMessage: webhookData.commit?.message || "",
          author: webhookData.commit?.author?.name || "Unknown",
          authorEmail: webhookData.commit?.author?.email || "",
        },
        parameters: params,
        cause: webhookData.cause || "WEBHOOK",
        environment: webhookData.environment || "development",
        progress: 0,
      });

      // Emit Socket.io event
      emitJenkinsBuildStarted({
        buildNumber,
        jobName: JENKINS_JOB_NAME,
        branch: webhookData.branch || "main",
        commit: webhookData.commit?.sha || "unknown",
        author: webhookData.commit?.author?.name || "Unknown",
      });

      return {
        success: true,
        buildNumber,
        buildUrl: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}/${buildNumber}`,
      };
    } else {
      throw new Error(
        location
          ? `Jenkins queued the build but did not assign a build number within the wait window. Queue URL: ${location}`
          : "Jenkins accepted the build request but did not return a queue location"
      );
    }
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error triggering pipeline:", message);
    return {
      success: false,
      error: message,
      buildNumber: null,
    };
  }
};

/**
 * Fetch complete build details from Jenkins and store in MongoDB
 */
export const fetchAndStoreBuildDetails = async (buildNumber, userId = "system") => {
  try {
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    // Fetch build info
    const buildResponse = await client.get(
      `/job/${JENKINS_JOB_NAME}/${buildNumber}/api/json?pretty=true`
    );

    const build = buildResponse.data;

    // Fetch detailed stages
    let stages = [];
    try {
      const stagesResponse = await client.get(
        `/job/${JENKINS_JOB_NAME}/${buildNumber}/wfapi/describe`
      );
      stages = stagesResponse.data.stages.map(stage => ({
        name: stage.name,
        status: stage.status || "UNKNOWN",
        startTime: new Date(stage.startTimeMillis),
        endTime: stage.durationMillis ? new Date(stage.startTimeMillis + stage.durationMillis) : null,
        duration: stage.durationMillis || 0,
      }));
    } catch (e) {
      console.warn("Could not fetch pipeline stages:", e.message);
    }

    // Fetch console logs
    let logs = "";
    try {
      const logsResponse = await client.get(
        `/job/${JENKINS_JOB_NAME}/${buildNumber}/logText/progressiveText?start=0`
      );
      logs = logsResponse.data || "";
    } catch (e) {
      console.warn("Could not fetch build logs:", e.message);
    }

    // Extract git information
    const gitAction = build.actions?.find(a => a._class?.includes("GitAction")) || {};
    const gitInfo = gitAction.lastBuiltRevision || {};

    // Extract parameters
    const paramAction = build.actions?.find(a => a._class?.includes("ParametersAction")) || {};
    const parameters = {};
    paramAction.parameters?.forEach(p => {
      parameters[p.name] = p.value;
    });

    // Calculate progress
    const progress = calculateProgress(stages);

    // Create/update build history
    const buildRecord = await BuildHistory.findOneAndUpdate(
      { userId, buildNumber, jobName: JENKINS_JOB_NAME },
      {
        userId,
        buildNumber,
        jobName: JENKINS_JOB_NAME,
        status: build.result || (build.inProgress ? "RUNNING" : "UNKNOWN"),
        result: build.result,
        displayName: build.displayName,
        description: build.description,
        buildUrl: build.url,
        timestamp: new Date(build.timestamp),
        startTime: new Date(build.startTime),
        endTime: build.result ? new Date(build.startTime + build.duration) : null,
        duration: build.duration,
        estimatedDuration: build.estimatedDuration,
        sourceCode: {
          repository: parameters.REPO_NAME || "unknown",
          branch: parameters.BRANCH || "main",
          commit: parameters.COMMIT_SHA || gitInfo.SHA1 || "unknown",
          commitMessage: parameters.COMMIT_MESSAGE || "",
          author: parameters.AUTHOR || gitInfo.branch?.[0]?.lastBuiltRevision?.branch?.[0]?.displayName || "Unknown",
        },
        parameters,
        stages,
        logs: {
          full: logs,
          tail: logs.split("\n").slice(-100).join("\n"),
        },
        progress,
        cause: build.actions?.find(a => a._class?.includes("CauseAction"))?.causes?.[0]?._class?.includes("UserIdCause")
          ? "MANUAL"
          : build.actions?.find(a => a._class?.includes("CauseAction"))?.causes?.[0]?._class?.includes("GithubPushCause")
          ? "WEBHOOK"
          : "API",
        syncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [Jenkins] Build ${buildNumber} details stored in MongoDB`);

    // Emit Socket.io event if build is complete
    if (buildRecord.status && buildRecord.status !== "RUNNING") {
      emitJenkinsBuildCompleted({
        buildNumber: buildRecord.buildNumber,
        jobName: buildRecord.jobName,
        status: buildRecord.status,
        result: buildRecord.result,
        duration: buildRecord.duration,
        logSummary: buildRecord.logs?.tail || "",
        artifacts: buildRecord.artifacts || [],
      });

      await Log.create({
        userId,
        source: "jenkins",
        logType: buildRecord.status === "SUCCESS" ? "info" : "error",
        buildNumber,
        message: `Jenkins build #${buildNumber} completed with ${buildRecord.status}`,
        rawLog: logs,
        metadata: {
          stage: "jenkins-build",
          status: buildRecord.status,
          duration: buildRecord.duration,
        },
      });

      emitNewLog({
        source: "jenkins",
        logType: buildRecord.status === "SUCCESS" ? "info" : "error",
        message: `Jenkins build #${buildNumber} completed with ${buildRecord.status}`,
      });

      if (buildRecord.status !== "SUCCESS") {
        await createAlert(userId, {
          type: "jenkins_build_failed",
          severity: "critical",
          title: "Jenkins Build Failed",
          message: `Build #${buildNumber} finished with ${buildRecord.status}`,
          resourceType: "pipeline",
          resourceId: String(buildNumber),
          metadata: { buildNumber },
        });
      }
    }

    return {
      success: true,
      buildNumber,
      build: buildRecord,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching build details:", message);
    return {
      success: false,
      error: message,
      buildNumber,
    };
  }
};

/**
 * Get Jenkins Build Status
 */
export const getJenkinsBuildStatus = async (buildNumber) => {
  try {
    // Mock mode: return simulated build status
    if (JENKINS_TOKEN === "mock-mode" || JENKINS_TOKEN?.startsWith("mock-")) {
      const mockBuild = getMockBuildData(buildNumber);
      return {
        buildNumber: mockBuild.buildNumber,
        status: mockBuild.status,
        url: mockBuild.buildUrl,
        duration: mockBuild.duration,
        estimatedDuration: mockBuild.estimatedDuration,
        timestamp: mockBuild.timestamp,
        inProgress: mockBuild.inProgress,
      };
    }

    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    const response = await client.get(
      `/job/${JENKINS_JOB_NAME}/${buildNumber}/api/json`
    );

    const build = response.data;

    return {
      buildNumber: build.number,
      status: build.result || (build.inProgress ? "RUNNING" : "UNKNOWN"),
      url: build.url,
      duration: build.duration,
      estimatedDuration: build.estimatedDuration,
      timestamp: build.timestamp,
      inProgress: build.inProgress,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching build status:", message);
    throw new Error(message);
  }
};

/**
 * Abort Jenkins Build
 */
export const abortJenkinsBuild = async (buildNumber) => {
  try {
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    await client.post(`/job/${JENKINS_JOB_NAME}/${buildNumber}/stop`);

    console.log(`✅ [Jenkins] Build ${buildNumber} aborted`);

    // Update MongoDB record
    await BuildHistory.updateOne(
      { buildNumber, jobName: JENKINS_JOB_NAME },
      { status: "ABORTED", result: "ABORTED", updatedAt: new Date() }
    );

    return { success: true, buildNumber };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error aborting build:", message);
    return { success: false, error: message, buildNumber };
  }
};

/**
 * Get Jenkins Build Console Logs with streaming support
 */
export const getJenkinsBuildLogs = async (buildNumber, start = 0) => {
  try {
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    const response = await client.get(
      `/job/${JENKINS_JOB_NAME}/${buildNumber}/logText/progressiveText?start=${start}`
    );

    const logs = response.data.split("\n").filter(l => l.trim());
    const hasMoreData = response.headers["x-more-data"] === "true";
    const nextStart = parseInt(response.headers["x-text-size"]) || 0;

    // Store logs in MongoDB
    await BuildHistory.updateOne(
      { buildNumber, jobName: JENKINS_JOB_NAME },
      {
        $set: {
          "logs.tail": logs.slice(-100).join("\n"),
          updatedAt: new Date(),
        },
        $push: {
          "logs.full": logs.join("\n"),
        },
      }
    );

    return {
      success: true,
      buildNumber,
      logs,
      hasMoreData,
      nextStart,
      totalSize: parseInt(response.headers["x-text-size"]) || 0,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching build logs:", message);
    return {
      success: false,
      error: message,
      buildNumber,
      logs: [],
      hasMoreData: false,
      nextStart: 0,
    };
  }
};

/**
 * Get Jenkins Pipeline Stages with Progress
 */
export const getJenkinsPipelineStages = async (buildNumber) => {
  try {
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    const response = await client.get(
      `/job/${JENKINS_JOB_NAME}/${buildNumber}/wfapi/describe`
    );

    const stages = response.data.stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      status: stage.status || "UNKNOWN",
      startTime: new Date(stage.startTimeMillis),
      duration: stage.durationMillis,
      pauseDuration: stage.pauseDurationMillis,
    }));

    const progress = calculateProgress(stages);

    // Update progress in MongoDB
    await BuildHistory.updateOne(
      { buildNumber, jobName: JENKINS_JOB_NAME },
      {
        stages,
        progress,
        updatedAt: new Date(),
      }
    );

    return {
      success: true,
      buildNumber,
      stages,
      progress,
      status: response.data.status,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching stages:", message);
    return {
      success: false,
      error: message,
      buildNumber,
      stages: [],
      progress: 0,
      status: "UNKNOWN",
    };
  }
};

/**
 * Get Last Successful Build from MongoDB (cached)
 */
export const getLastSuccessfulBuild = async (userId = "system") => {
  try {
    // Try MongoDB first
    const cachedBuild = await BuildHistory.findOne(
      { userId, status: "SUCCESS", jobName: JENKINS_JOB_NAME },
      null,
      { sort: { buildNumber: -1 } }
    );

    if (cachedBuild) {
      return {
        success: true,
        buildNumber: cachedBuild.buildNumber,
        status: "SUCCESS",
        url: cachedBuild.buildUrl,
        duration: cachedBuild.duration,
        timestamp: cachedBuild.timestamp,
        commit: cachedBuild.sourceCode?.commit || null,
        author: cachedBuild.sourceCode?.author || null,
      };
    }

    // Fallback to Jenkins API
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured and no cached data");
    }

    const client = getJenkinsAxios();
    const response = await client.get(`/job/${JENKINS_JOB_NAME}/lastSuccessfulBuild/api/json`);
    const build = response.data;

    return {
      success: true,
      buildNumber: build.number,
      status: "SUCCESS",
      url: build.url,
      duration: build.duration,
      timestamp: build.timestamp,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching last successful build:", message);
    return {
      success: false,
      error: message,
    };
  }
};

/**
 * Get Build History from Jenkins and sync with MongoDB
 */
export const getBuildHistory = async (limit = 20, userId = "system") => {
  try {
    if (!isJenkinsConfigured()) {
      throw new Error("Jenkins not configured");
    }

    const client = getJenkinsAxios();

    const response = await client.get(
      `/job/${JENKINS_JOB_NAME}/api/json?tree=builds[number,result,duration,timestamp,url,displayName]{0,${limit}}`
    );

    const builds = response.data.builds.map(b => ({
      buildNumber: b.number,
      status: b.result || "RUNNING",
      duration: b.duration,
      timestamp: b.timestamp,
      url: b.url,
      displayName: b.displayName,
    }));

    // Store builds in MongoDB
    const bulkOps = builds.map(b => ({
      updateOne: {
        filter: { userId, buildNumber: b.buildNumber, jobName: JENKINS_JOB_NAME },
        update: {
          $setOnInsert: {
            userId,
            buildNumber: b.buildNumber,
            jobName: JENKINS_JOB_NAME,
            status: b.status,
            displayName: b.displayName,
            buildUrl: b.url,
            timestamp: new Date(b.timestamp),
            duration: b.duration,
            createdAt: new Date(),
          },
          $set: {
            status: b.status,
            duration: b.duration,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await BuildHistory.bulkWrite(bulkOps);
      console.log(`✅ [Jenkins] Synced ${bulkOps.length} builds to MongoDB`);
    }

    return {
      success: true,
      builds,
      count: builds.length,
    };
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching build history:", message);
    return {
      success: false,
      error: message,
      builds: [],
    };
  }
};

/**
 * Get Pipeline Status with real-time data
 */
export const getPipelineStatus = async (userId = "system") => {
  try {
    // Return cached response if fresh enough
    const now = Date.now();
    if (cachedPipelineStatus && (now - cachedStatusTime) < CACHE_DURATION) {
      console.log("📦 [Jenkins] Using cached pipeline status");
      return cachedPipelineStatus;
    }

    // Mock mode: return simulated data
    if (JENKINS_TOKEN === "mock-mode" || JENKINS_TOKEN?.startsWith("mock-")) {
      const mockBuild = getMockBuildData(Math.floor(Math.random() * 50) + 1);
      return {
        success: true,
        status: mockBuild.inProgress ? "RUNNING" : mockBuild.status,
        progress: mockBuild.inProgress ? 75 : 100,
        buildNumber: mockBuild.buildNumber,
        jobName: JENKINS_JOB_NAME,
        url: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}`,
        lastBuild: {
          number: mockBuild.buildNumber,
          status: mockBuild.inProgress ? "RUNNING" : mockBuild.status,
          url: mockBuild.buildUrl,
        },
        lastCompletedBuild: {
          number: mockBuild.buildNumber - 1,
          status: "SUCCESS",
          duration: 53000,
          timestamp: Date.now() - 120000,
        },
      };
    }

    if (!isJenkinsConfigured()) {
      return {
        success: false,
        error: "Jenkins not configured",
        status: "UNKNOWN",
        progress: 0,
      };
    }

    const client = getJenkinsAxios();
    await ensureGenericPipelineJob(client);

    const jobResponse = await client.get(`/job/${JENKINS_JOB_NAME}/api/json`);
    const job = jobResponse.data;
    const lastBuild = job.lastBuild;
    const lastCompletedBuild = job.lastCompletedBuild;

    let status = "IDLE";
    let progress = 0;
    let buildNumber = null;

    if (lastBuild?.inProgress) {
      status = "RUNNING";
      buildNumber = lastBuild.number;
      
      // Try to get actual progress from stages
      try {
        const stagesResponse = await client.get(
          `/job/${JENKINS_JOB_NAME}/${buildNumber}/wfapi/describe`
        );
        progress = calculateProgress(stagesResponse.data.stages || []);
      } catch (e) {
        progress = 50; // Default progress for running builds
      }
    } else if (lastCompletedBuild?.result === "SUCCESS") {
      status = "SUCCESS";
      progress = 100;
      buildNumber = lastCompletedBuild.number;
    } else if (lastCompletedBuild?.result === "FAILURE") {
      status = "FAILED";
      progress = 0;
      buildNumber = lastCompletedBuild.number;
    }

    const response = {
      success: true,
      status,
      progress,
      buildNumber,
      jobName: JENKINS_JOB_NAME,
      url: `${JENKINS_URL}/job/${JENKINS_JOB_NAME}`,
      lastBuild: lastBuild ? {
        number: lastBuild.number,
        status: lastBuild.inProgress ? "RUNNING" : lastBuild.result,
        url: lastBuild.url,
      } : null,
      lastCompletedBuild: lastCompletedBuild ? {
        number: lastCompletedBuild.number,
        status: lastCompletedBuild.result,
        duration: lastCompletedBuild.duration,
        timestamp: lastCompletedBuild.timestamp,
      } : null,
    };

    // Cache the successful response
    cachedPipelineStatus = response;
    cachedStatusTime = Date.now();

    return response;
  } catch (error) {
    const message = formatJenkinsError(error);
    console.error("❌ [Jenkins] Error fetching pipeline status:", message);
    
    // Return cached data if available, even if stale
    if (cachedPipelineStatus) {
      console.log("📦 [Jenkins] Returning stale cached response due to error");
      return cachedPipelineStatus;
    }
    
    // Fall back to mock data
    const mockData = getMockBuildData(1);
    mockData.cached = true;
    mockData.error = "Using mock data - Jenkins unavailable";
    return mockData;
  }
};

// ============ MongoDB Query Functions ============

/**
 * Get build history from MongoDB
 */
export const getBuildHistoryFromDB = async (userId, limit = 20, skip = 0) => {
  try {
    // Quick check if database is available
    if (!isDbConnected()) {
      console.warn("⚠️  [MongoDB] Database unavailable - returning empty history");
      return {
        success: true,
        builds: [],
        total: 0,
        limit,
        skip,
      };
    }

    const builds = await BuildHistory.find({ userId })
      .sort({ buildNumber: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await BuildHistory.countDocuments({ userId });

    return {
      success: true,
      builds,
      total,
      limit,
      skip,
    };
  } catch (error) {
    console.error("❌ [MongoDB] Error fetching builds:", error.message);
    // Return empty results instead of error to prevent frontend issues
    return {
      success: true,
      builds: [],
      total: 0,
      limit,
      skip,
      message: "Unable to fetch builds - returning empty list",
    };
  }
};

/**
 * Get build details from MongoDB
 */
export const getBuildDetailsFromDB = async (userId, buildNumber) => {
  try {
    const build = await BuildHistory.findOne({
      userId,
      buildNumber,
      jobName: JENKINS_JOB_NAME,
    });

    if (!build) {
      return {
        success: false,
        error: "Build not found",
      };
    }

    return {
      success: true,
      build,
    };
  } catch (error) {
    console.error("❌ [MongoDB] Error fetching build details:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get builds by status from MongoDB
 */
export const getBuildsByStatus = async (userId, status, limit = 20) => {
  try {
    const builds = await BuildHistory.find({ userId, status })
      .sort({ buildNumber: -1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      builds,
      count: builds.length,
    };
  } catch (error) {
    console.error("❌ [MongoDB] Error fetching builds by status:", error.message);
    return {
      success: false,
      error: error.message,
      builds: [],
    };
  }
};

/**
 * Get builds by branch from MongoDB
 */
export const getBuildsByBranch = async (userId, branch, limit = 20) => {
  try {
    const builds = await BuildHistory.find({
      userId,
      "sourceCode.branch": branch,
    })
      .sort({ buildNumber: -1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      builds,
      count: builds.length,
    };
  } catch (error) {
    console.error("❌ [MongoDB] Error fetching builds by branch:", error.message);
    return {
      success: false,
      error: error.message,
      builds: [],
    };
  }
};

/**
 * Get build statistics from MongoDB
 */
export const getBuildStatistics = async (userId, days = 30) => {
  try {
    // Quick check if database is available - prevents hanging on MongoDB timeout
    if (!isDbConnected()) {
      console.warn("⚠️  [MongoDB] Database unavailable - returning empty statistics");
      return {
        success: true,
        stats: {
          totalBuilds: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 0,
          averageDuration: 0,
          totalDuration: 0,
          buildsPerDay: [],
        },
      };
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await BuildHistory.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgDuration: { $avg: "$duration" },
          totalDuration: { $sum: "$duration" },
        },
      },
    ]);

    const total = await BuildHistory.countDocuments({
      userId,
      createdAt: { $gte: since },
    });

    // Transform MongoDB aggregation result to frontend-friendly format
    let successCount = 0;
    let failureCount = 0;
    let totalDuration = 0;
    let totalAvgDuration = 0;

    stats.forEach(stat => {
      if (stat._id === 'SUCCESS') {
        successCount = stat.count;
        totalDuration = stat.totalDuration || 0;
      } else if (stat._id === 'FAILURE') {
        failureCount = stat.count;
      }
    });

    const successRate = total > 0 ? (successCount / total) * 100 : 0;
    const averageDuration = total > 0 ? Math.round(totalDuration / total) : 0;

    return {
      success: true,
      stats: {
        totalBuilds: total,
        successCount,
        failureCount,
        successRate: Math.round(successRate * 10) / 10,
        avgDuration: averageDuration,
        totalDuration,
        buildsPerDay: [],
      },
      period: `Last ${days} days`,
    };
  } catch (error) {
    console.error("❌ [MongoDB] Error calculating build statistics:", error.message);
    return {
      success: true,
      stats: {
        totalBuilds: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0,
        buildsPerDay: [],
      },
    };
  }
};

/**
 * Broadcast Jenkins updates to all connected WebSocket clients
 */
export const broadcastJenkinsBuildStatus = async (io, userId = "system") => {
  try {
    const status = await getPipelineStatus(userId);
    if (status.success) {
      io.to("jenkins-status").emit("jenkins:status-update", status);
      io.to("jenkins-builds").emit("jenkins:pipeline-update", status);
    }
  } catch (error) {
    console.error("❌ [Jenkins] Error broadcasting status:", error.message);
  }
};

/**
 * Start Jenkins monitoring service with WebSocket broadcasting
 */
export const startJenkinsMonitoring = (io) => {
  // Poll Jenkins status every 30 seconds (reduced frequency) and broadcast to connected clients
  const pollingInterval = setInterval(async () => {
    try {
      // Add timeout to prevent hanging (8 second timeout + 2 second buffer)
      const statusPromise = getPipelineStatus("system");
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Jenkins polling timeout")), 10000)
      );
      
      const status = await Promise.race([statusPromise, timeoutPromise]);
      
      if (status.success) {
        io.to("jenkins-status").emit("jenkins:status-update", status);
        
        // If build is running, emit progress
        if (status.status === "RUNNING") {
          io.to("jenkins-builds").emit("jenkins:build-progress", {
            buildNumber: status.buildNumber,
            progress: status.progress,
            status: status.status,
          });
        }
        
        // If build just completed, emit completion event
        if (status.status === "SUCCESS" || status.status === "FAILURE") {
          io.to("jenkins-builds").emit("jenkins:build-completed", status);
        }
      } else {
        // If not successful but no error, still emit update
        io.to("jenkins-status").emit("jenkins:status-error", {
          error: status.error || "Unable to fetch Jenkins status",
          status: "UNKNOWN",
        });
      }
    } catch (error) {
      console.error("❌ [Jenkins Monitoring] Error:", error.message);
      
      // Emit error to connected clients so UI knows Jenkins is unavailable
      io.to("jenkins-status").emit("jenkins:status-error", {
        error: error.message,
        status: "UNAVAILABLE",
      });
    }
  }, 30000); // 30 seconds - reduced frequency to prevent overwhelming Jenkins

  // Return cleanup function
  return () => clearInterval(pollingInterval);
};

/**
 * Emit build triggered event
 */
export const emitBuildTriggered = (io, buildNumber, buildData) => {
  io.to("jenkins-builds").emit("jenkins:build-started", {
    buildNumber,
    ...buildData,
  });
};
