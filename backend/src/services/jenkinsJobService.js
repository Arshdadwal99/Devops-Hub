import axios from "axios";
import crypto from "crypto";
import mongoose from "mongoose";
import { JenkinsJob } from "../models/JenkinsJob.js";
import { Pipeline } from "../models/Pipeline.js";
import { isDbConnected, localDB } from "../db.js";
import { getJenkinsConnectionCredentials } from "./jenkinsConnectionService.js";

const DEFAULT_JENKINSFILE_PATH = "Jenkinsfile";

function normalizeJenkinsBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function getEnvJenkinsUrl() {
  return normalizeJenkinsBaseUrl(process.env.JENKINS_URL);
}

function getUrlParts(url) {
  try {
    return new URL(url);
  } catch (_error) {
    return null;
  }
}

function hasExplicitPort(url) {
  return /https?:\/\/[^/?#:]+:\d+/i.test(String(url || ""));
}

function resolveJenkinsBaseUrl(savedUrl) {
  const cleanSavedUrl = normalizeJenkinsBaseUrl(savedUrl);
  const cleanEnvUrl = getEnvJenkinsUrl();
  const saved = getUrlParts(cleanSavedUrl);
  const env = getUrlParts(cleanEnvUrl);

  if (
    saved &&
    env &&
    saved.hostname === env.hostname &&
    !hasExplicitPort(cleanSavedUrl) &&
    (hasExplicitPort(cleanEnvUrl) || env.pathname !== "/")
  ) {
    return {
      url: cleanEnvUrl,
      originalUrl: cleanSavedUrl,
      corrected: true,
      reason: "Saved Jenkins URL is missing the configured Jenkins port or context path",
    };
  }

  return {
    url: cleanSavedUrl,
    originalUrl: cleanSavedUrl,
    corrected: false,
    reason: null,
  };
}

function validateJenkinsCredentials(credentials = {}) {
  const resolved = resolveJenkinsBaseUrl(credentials.url);
  const url = resolved.url;
  const username = String(credentials.username || "").trim();
  const apiToken = String(credentials.apiToken || "").trim();

  if (!url) throw new Error("Jenkins URL is required");
  if (!/^https?:\/\//i.test(url)) throw new Error("Jenkins URL must start with http:// or https://");
  if (!username) throw new Error("Jenkins username is required");
  if (!apiToken) throw new Error("Jenkins API token is required");

  return { url, username, apiToken, originalUrl: resolved.originalUrl, urlCorrected: resolved.corrected, urlCorrectionReason: resolved.reason };
}

function buildJenkinsUrl(baseUrl, path, params = {}) {
  const cleanBase = normalizeJenkinsBaseUrl(baseUrl);
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

function classifyJenkinsRootCause({ baseUrl, endpoint, response, cause, message }) {
  const status = response?.status;
  const body = responseBodyToString(response?.data);

  if (status >= 200 && status < 400) return null;
  if (status === 401) return "authentication issue";
  if (status === 403) return body.toLowerCase().includes("crumb") ? "missing crumb" : "authentication issue";
  if (status === 404) {
    const parts = getUrlParts(baseUrl);
    if (parts && !hasExplicitPort(baseUrl) && parts.pathname === "/") {
      return "wrong Jenkins URL";
    }
    if (endpoint && !endpoint.includes(":8080") && !endpoint.includes("/jenkins/")) {
      return "wrong Jenkins URL";
    }
    return "bad endpoint";
  }
  if (cause?.code === "ECONNREFUSED" || cause?.code === "ENOTFOUND" || cause?.code === "ETIMEDOUT") {
    return "Jenkins not running";
  }
  if (/crumb/i.test(message || body)) return "missing crumb";
  return "Jenkins request failed";
}

function buildJenkinsDiagnostics({ baseUrl, endpoint, jobName, response, responseBody, message, cause }) {
  return {
    baseUrl: normalizeJenkinsBaseUrl(baseUrl),
    endpoint,
    jobName,
    responseCode: response?.status || null,
    responseHeaders: response?.headers || null,
    responseBody: responseBody !== undefined ? responseBodyToString(responseBody) : responseBodyToString(response?.data),
    message,
    rootCause: classifyJenkinsRootCause({ baseUrl, endpoint, response, cause, message }),
  };
}

function logJenkinsDiagnostics(details) {
  console.log(
    `[JENKINS]\n` +
      `URL: ${details.baseUrl || ""}\n` +
      `Base URL: ${details.baseUrl || ""}\n` +
      `Endpoint: ${details.endpoint || ""}\n` +
      `Job Name: ${details.jobName || ""}\n` +
      `Status: ${details.responseCode ?? ""}\n` +
      `Response Code: ${details.responseCode ?? ""}\n` +
      `Response Headers: ${responseBodyToString(details.responseHeaders)}\n` +
      `Response: ${details.responseBody || ""}\n` +
      `Response Body: ${details.responseBody || ""}\n` +
      `Root Cause: ${details.rootCause || ""}`
  );
}

function logJenkinsRequest({ baseUrl, endpoint, jobName }) {
  console.log("[JENKINS] Base URL:", normalizeJenkinsBaseUrl(baseUrl));
  console.log("[JENKINS] Endpoint:", endpoint);
  console.log("[JENKINS] Job Name:", jobName || "");
}

function createJenkinsRequestError(message, diagnostics, cause) {
  const error = new Error(message);
  error.name = "JenkinsRequestError";
  error.jenkins = diagnostics;
  error.status = diagnostics?.responseCode;
  if (cause) error.cause = cause;
  return error;
}

function createJenkinsClient({ url, username, apiToken }) {
  const client = axios.create({
    baseURL: normalizeJenkinsBaseUrl(url),
    timeout: 15000,
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString("base64")}`,
      "User-Agent": "DevOps-Hub",
    },
  });

  client.interceptors.request.use((config) => {
    const endpoint = buildJenkinsUrl(url, config.url, config.params);
    logJenkinsRequest({
      baseUrl: url,
      endpoint,
      jobName: config.jenkinsJobName,
    });
    return config;
  });

  return client;
}

async function getCrumbHeaders(client, jobName = "") {
  try {
    const response = await client.get("/crumbIssuer/api/json", { jenkinsJobName: jobName });
    return {
      [response.data.crumbRequestField]: response.data.crumb,
    };
  } catch (error) {
    console.warn("[Jenkins Jobs] CSRF crumb unavailable, continuing without crumb:", error.message);
    return {};
  }
}

async function verifyJenkinsForJobCreation(client, { baseUrl, jobName }) {
  const rootEndpoint = buildJenkinsUrl(baseUrl, "/api/json");
  try {
    const response = await client.get("/api/json", { jenkinsJobName: jobName });
    logJenkinsDiagnostics(buildJenkinsDiagnostics({
      baseUrl,
      endpoint: rootEndpoint,
      jobName,
      response,
      responseBody: response.data,
    }));
  } catch (error) {
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint: rootEndpoint,
      jobName,
      response: error.response,
      responseBody: error.response?.data,
      message: "Jenkins connection failed",
      cause: error,
    });
    logJenkinsDiagnostics(diagnostics);
    throw createJenkinsRequestError("Jenkins connection failed", diagnostics, error);
  }

  const crumbEndpoint = buildJenkinsUrl(baseUrl, "/crumbIssuer/api/json");
  try {
    const response = await client.get("/crumbIssuer/api/json", { jenkinsJobName: jobName });
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint: crumbEndpoint,
      jobName,
      response,
      responseBody: response.data,
    });
    logJenkinsDiagnostics(diagnostics);
    return {
      [response.data.crumbRequestField]: response.data.crumb,
    };
  } catch (error) {
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint: crumbEndpoint,
      jobName,
      response: error.response,
      responseBody: error.response?.data,
      message: "Jenkins crumb issuer unavailable",
      cause: error,
    });
    logJenkinsDiagnostics(diagnostics);
    console.warn("[JENKINS] Crumb issuer unavailable, continuing without crumb if Jenkins allows it");
    return {};
  }
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeJobPart(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "app";
}

function normalizeBranch(branch) {
  return String(branch || "main").trim() || "main";
}

function normalizeJenkinsfilePath(jenkinsfilePath) {
  return String(jenkinsfilePath || DEFAULT_JENKINSFILE_PATH).trim() || DEFAULT_JENKINSFILE_PATH;
}

function normalizeRepository({ owner, repo, repositoryUrl }) {
  const cleanOwner = String(owner || "").trim();
  const cleanRepo = String(repo || "").trim();
  const cleanUrl = String(repositoryUrl || "").trim();

  if (!cleanUrl && (!cleanOwner || !cleanRepo)) {
    throw new Error("repositoryUrl or owner/repo is required");
  }

  const url = cleanUrl || `https://github.com/${cleanOwner}/${cleanRepo}.git`;
  const inferred = inferRepositoryParts(url);

  return {
    owner: cleanOwner || inferred.owner,
    name: cleanRepo || inferred.name,
    url,
  };
}

function inferRepositoryParts(repositoryUrl) {
  const withoutGit = String(repositoryUrl || "").replace(/\.git$/i, "");
  const match = withoutGit.match(/[:/]([^/:]+)\/([^/]+)$/);

  return {
    owner: match?.[1] || "",
    name: match?.[2] || sanitizeJobPart(withoutGit.split("/").pop()),
  };
}

function normalizeJobName({ jobName, owner, repo, branch }) {
  if (jobName && String(jobName).trim()) {
    return sanitizeJobPart(jobName);
  }

  return `devops-hub-${sanitizeJobPart(owner)}-${sanitizeJobPart(repo)}-${sanitizeJobPart(branch)}`;
}

function buildJobId({ jenkinsUrl, repositoryUrl, branch, jenkinsfilePath }) {
  return crypto
    .createHash("sha256")
    .update([jenkinsUrl, repositoryUrl, branch, jenkinsfilePath].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function buildPipelineJobConfigXml({ repositoryUrl, branch, jenkinsfilePath }) {
  return `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions/>
  <description>Pipeline job auto-created by DevOps Hub. Jenkinsfile: ${escapeXml(jenkinsfilePath)}</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>${escapeXml(repositoryUrl)}</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/${escapeXml(branch)}</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>${escapeXml(jenkinsfilePath)}</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>`;
}

function buildTriggersXml(enabled) {
  if (!enabled) return "<triggers/>";

  return `<triggers>
    <com.cloudbees.jenkins.GitHubPushTrigger plugin="github">
      <spec></spec>
    </com.cloudbees.jenkins.GitHubPushTrigger>
  </triggers>`;
}

function setGitHubPushTrigger(configXml, enabled) {
  const triggersXml = buildTriggersXml(enabled);
  const cleanConfig = String(configXml || "");

  if (/<triggers[\s\S]*?<\/triggers>|<triggers\s*\/>/i.test(cleanConfig)) {
    return cleanConfig.replace(/<triggers[\s\S]*?<\/triggers>|<triggers\s*\/>/i, triggersXml);
  }

  return cleanConfig.replace("</flow-definition>", `${triggersXml}\n</flow-definition>`);
}

function toPublicJob(job) {
  if (!job) return null;
  const plain = typeof job.toObject === "function" ? job.toObject() : job;

  return {
    id: String(plain._id || plain.jobId),
    jobId: plain.jobId,
    jobName: plain.jobName,
    jobUrl: plain.jobUrl,
    status: plain.status,
    repository: plain.repository,
    jenkins: plain.jenkins,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    createdInJenkinsAt: plain.createdInJenkinsAt,
    deletedFromJenkinsAt: plain.deletedFromJenkinsAt,
    lastRecreatedAt: plain.lastRecreatedAt,
  };
}

async function findDuplicate(userId, { jenkinsUrl, repositoryUrl, branch, jenkinsfilePath }) {
  if (isDbConnected()) {
    return JenkinsJob.findOne({
      userId,
      status: "active",
      "jenkins.url": jenkinsUrl,
      "repository.url": repositoryUrl,
      "repository.branch": branch,
      "repository.jenkinsfilePath": jenkinsfilePath,
    }).lean();
  }

  return localDB.findActiveJenkinsJob(userId, { jenkinsUrl, repositoryUrl, branch, jenkinsfilePath });
}

async function findJob(userId, id) {
  if (isDbConnected()) {
    const conditions = [{ jobId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
      conditions.push({ _id: id });
    }

    return JenkinsJob.findOne({
      userId,
      $or: conditions,
    });
  }

  return localDB.findJenkinsJobById(userId, id);
}

async function updatePipelineJobStage(userId, job) {
  const update = {
    jenkinsJob: {
      jobId: job.jobId,
      jobName: job.jobName,
      jobUrl: job.jobUrl,
      createdAt: new Date(),
    },
    updatedAt: new Date(),
  };

  const stageUpdate = {
    "stages.$[stage].status": "success",
    "stages.$[stage].logs": [`Created Jenkins job ${job.jobName}`],
  };

  if (isDbConnected()) {
    await Pipeline.updateMany(
      {
        userId,
        provider: "jenkins",
        "repository.owner": job.repository.owner,
        "repository.name": job.repository.name,
      },
      { $set: { ...update, ...stageUpdate } },
      { arrayFilters: [{ "stage.name": "Create Jenkins Job" }] }
    ).catch((error) => {
      console.warn("[Jenkins Jobs] Failed to update pipeline stage:", error.message);
    });
  }
}

async function createJobInJenkins(client, { baseUrl, jobName, configXml, crumbHeaders = {} }) {
  const endpoint = buildJenkinsUrl(baseUrl, "/createItem", { name: jobName });
  try {
    const response = await client.post("/createItem", configXml, {
      params: { name: jobName },
      headers: {
        ...crumbHeaders,
        "Content-Type": "application/xml",
      },
      jenkinsJobName: jobName,
    });
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint,
      jobName,
      response,
      responseBody: response.data,
    });
    logJenkinsDiagnostics(diagnostics);
    return diagnostics;
  } catch (error) {
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint,
      jobName,
      response: error.response,
      responseBody: error.response?.data,
      message: error.message,
      cause: error,
    });
    logJenkinsDiagnostics(diagnostics);
    throw createJenkinsRequestError(
      error.response?.status === 404
        ? `Jenkins returned 404 while creating job. URL requested: ${endpoint}. Base URL: ${baseUrl}. Response: ${diagnostics.responseBody || "No response body"}`
        : error.message,
      diagnostics,
      error
    );
  }
}

async function deleteJobInJenkins(client, jobName) {
  const crumbHeaders = await getCrumbHeaders(client, jobName);
  await client.post(`/job/${encodeURIComponent(jobName)}/doDelete`, null, {
    headers: crumbHeaders,
    jenkinsJobName: jobName,
  });
}

async function fetchJobConfigXml(client, jobName) {
  const response = await client.get(`/job/${encodeURIComponent(jobName)}/config.xml`, {
    responseType: "text",
    jenkinsJobName: jobName,
  });
  return response.data;
}

async function updateJobConfigXml(client, { baseUrl, jobName, configXml, crumbHeaders = {} }) {
  const endpoint = buildJenkinsUrl(baseUrl, `/job/${encodeURIComponent(jobName)}/config.xml`);
  try {
    const response = await client.post(`/job/${encodeURIComponent(jobName)}/config.xml`, configXml, {
      headers: {
        ...crumbHeaders,
        "Content-Type": "application/xml",
      },
      jenkinsJobName: jobName,
    });
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint,
      jobName,
      response,
      responseBody: response.data,
    });
    logJenkinsDiagnostics(diagnostics);
    return diagnostics;
  } catch (error) {
    const diagnostics = buildJenkinsDiagnostics({
      baseUrl,
      endpoint,
      jobName,
      response: error.response,
      responseBody: error.response?.data,
      message: error.message,
      cause: error,
    });
    logJenkinsDiagnostics(diagnostics);
    throw createJenkinsRequestError(error.message, diagnostics, error);
  }
}

export async function createJenkinsJob(userId, payload = {}) {
  const credentials = validateJenkinsCredentials(await getJenkinsConnectionCredentials(userId));
  if (credentials.urlCorrected) {
    console.warn("[JENKINS] Saved Jenkins URL corrected from environment", {
      savedUrl: credentials.originalUrl,
      effectiveUrl: credentials.url,
      reason: credentials.urlCorrectionReason,
    });
  }
  const client = createJenkinsClient(credentials);
  const repository = normalizeRepository(payload);
  const branch = normalizeBranch(payload.branch);
  const jenkinsfilePath = normalizeJenkinsfilePath(payload.jenkinsfilePath);
  const jobName = normalizeJobName({
    jobName: payload.jobName,
    owner: repository.owner,
    repo: repository.name,
    branch,
  });
  const jobId = buildJobId({
    jenkinsUrl: credentials.url,
    repositoryUrl: repository.url,
    branch,
    jenkinsfilePath,
  });
  const existing = await findDuplicate(userId, {
    jenkinsUrl: credentials.url,
    repositoryUrl: repository.url,
    branch,
    jenkinsfilePath,
  });

  const configXml = buildPipelineJobConfigXml({
    repositoryUrl: repository.url,
    branch,
    jenkinsfilePath,
  });
  const crumbHeaders = await verifyJenkinsForJobCreation(client, {
    baseUrl: credentials.url,
    jobName,
  });

  if (existing && !payload.force) {
    const updateDiagnostics = await updateJobConfigXml(client, {
      baseUrl: credentials.url,
      jobName: existing.jobName,
      configXml,
      crumbHeaders,
    });
    const updates = {
      jobName: existing.jobName,
      jobUrl: `${credentials.url}/job/${encodeURIComponent(existing.jobName)}/`,
      configXml,
      status: "active",
      updatedAt: new Date(),
      createdInJenkinsAt: existing.createdInJenkinsAt || new Date(),
    };
    const updated = isDbConnected()
      ? await JenkinsJob.findOneAndUpdate({ _id: existing._id }, updates, { new: true })
      : localDB.updateJenkinsJob(userId, existing._id || existing.jobId, updates);

    await updatePipelineJobStage(userId, updated || existing);
    return {
      success: true,
      duplicate: true,
      updated: true,
      message: "Jenkins job already exists; updated job config",
      job: toPublicJob(updated || existing),
      jenkins: {
        ...updateDiagnostics,
        originalBaseUrl: credentials.originalUrl,
        urlCorrected: credentials.urlCorrected,
        urlCorrectionReason: credentials.urlCorrectionReason,
        rootCause: credentials.urlCorrected ? "wrong Jenkins URL" : updateDiagnostics.rootCause,
      },
    };
  }

  if (payload.force && existing) {
    await deleteJobInJenkins(client, existing.jobName).catch((error) => {
      if (error.response?.status !== 404) throw error;
    });
    if (isDbConnected()) {
      await JenkinsJob.updateOne(
        { _id: existing._id },
        { status: "deleted", deletedFromJenkinsAt: new Date(), updatedAt: new Date() }
      );
    } else {
      localDB.updateJenkinsJob(userId, existing._id || existing.jobId, {
        status: "deleted",
        deletedFromJenkinsAt: new Date(),
      });
    }
  }

  let createDiagnostics = null;
  try {
    createDiagnostics = await createJobInJenkins(client, { baseUrl: credentials.url, jobName, configXml, crumbHeaders });
  } catch (error) {
    if (error.status === 400 || error.response?.status === 400) {
      createDiagnostics = await updateJobConfigXml(client, {
        baseUrl: credentials.url,
        jobName,
        configXml,
        crumbHeaders,
      });
    } else {
      throw error;
    }
  }

  const jobData = {
    userId,
    jobId,
    jobName,
    jobUrl: `${credentials.url}/job/${encodeURIComponent(jobName)}/`,
    status: "active",
    repository: {
      ...repository,
      branch,
      jenkinsfilePath,
    },
    jenkins: {
      url: credentials.url,
      username: credentials.username,
      createEndpoint: buildJenkinsUrl(credentials.url, "/createItem", { name: jobName }),
      lastEndpoint: createDiagnostics?.endpoint,
    },
    configXml,
    createdInJenkinsAt: new Date(),
    lastRecreatedAt: payload.force ? new Date() : null,
  };

  const job = isDbConnected()
    ? await JenkinsJob.findOneAndUpdate(
        { userId, jobId },
        { $set: jobData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
    : localDB.createJenkinsJob(jobData);

  await updatePipelineJobStage(userId, job);

  return {
    success: true,
    message: "Jenkins Job Created",
    job: toPublicJob(job),
    jenkins: {
      ...createDiagnostics,
      originalBaseUrl: credentials.originalUrl,
      urlCorrected: credentials.urlCorrected,
      urlCorrectionReason: credentials.urlCorrectionReason,
      rootCause: credentials.urlCorrected ? "wrong Jenkins URL" : createDiagnostics?.rootCause,
    },
  };
}

export async function listJenkinsJobs(userId) {
  const jobs = isDbConnected()
    ? await JenkinsJob.find({ userId }).sort({ createdAt: -1 }).lean()
    : localDB.findJenkinsJobs(userId);

  return {
    success: true,
    jobs: jobs.map(toPublicJob),
  };
}

export async function getJenkinsJob(userId, id) {
  const job = await findJob(userId, id);
  if (!job) throw new Error("Jenkins job not found");

  return {
    success: true,
    job: toPublicJob(job),
  };
}

export async function deleteJenkinsJob(userId, id) {
  const job = await findJob(userId, id);
  if (!job) throw new Error("Jenkins job not found");

  const credentials = validateJenkinsCredentials(await getJenkinsConnectionCredentials(userId));
  const client = createJenkinsClient(credentials);
  await deleteJobInJenkins(client, job.jobName).catch((error) => {
    if (error.response?.status !== 404) throw error;
  });

  const updates = {
    status: "deleted",
    deletedFromJenkinsAt: new Date(),
    updatedAt: new Date(),
  };
  const updated = isDbConnected()
    ? await JenkinsJob.findOneAndUpdate({ userId, _id: job._id }, updates, { new: true })
    : localDB.updateJenkinsJob(userId, id, updates);

  return {
    success: true,
    message: "Jenkins job deleted",
    job: toPublicJob(updated),
  };
}

export async function recreateJenkinsJob(userId, id) {
  const job = await findJob(userId, id);
  if (!job) throw new Error("Jenkins job not found");

  return createJenkinsJob(userId, {
    owner: job.repository?.owner,
    repo: job.repository?.name,
    repositoryUrl: job.repository?.url,
    branch: job.repository?.branch,
    jenkinsfilePath: job.repository?.jenkinsfilePath,
    jobName: job.jobName,
    force: true,
  });
}

export async function configureJenkinsJobAutoDeploy(userId, id, enabled) {
  const job = await findJob(userId, id);
  if (!job) throw new Error("Jenkins job not found");
  if (job.status !== "active") throw new Error("Jenkins job is not active");

  const credentials = validateJenkinsCredentials(await getJenkinsConnectionCredentials(userId));
  const client = createJenkinsClient(credentials);
  const currentConfig = job.configXml || await fetchJobConfigXml(client, job.jobName);
  const updatedConfig = setGitHubPushTrigger(currentConfig, enabled);

  await updateJobConfigXml(client, {
    baseUrl: credentials.url,
    jobName: job.jobName,
    configXml: updatedConfig,
    crumbHeaders: await getCrumbHeaders(client, job.jobName),
  });

  const updates = {
    configXml: updatedConfig,
    autoDeployEnabled: Boolean(enabled),
    autoDeployUpdatedAt: new Date(),
    updatedAt: new Date(),
  };

  const updated = isDbConnected()
    ? await JenkinsJob.findOneAndUpdate({ userId, _id: job._id }, updates, { new: true })
    : localDB.updateJenkinsJob(userId, id, updates);

  return {
    success: true,
    message: enabled ? "Jenkins auto deploy trigger enabled" : "Jenkins auto deploy trigger disabled",
    job: toPublicJob(updated),
  };
}
