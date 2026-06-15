import axios from "axios";
import { Deployment } from "../models/Deployment.js";
import { GitHubWebhookConfig } from "../models/GitHubWebhookConfig.js";
import { Pipeline } from "../models/Pipeline.js";
import { Webhook } from "../models/Webhook.js";
import { isDbConnected, localDB } from "../db.js";
import { getGitHubAccessToken, getGitHubWriteToken } from "./githubService.js";
import { getJenkinsStatus } from "./jenkinsConnectionService.js";

const GITHUB_API_BASE = "https://api.github.com";
const WEBHOOK_EVENTS = ["push", "pull_request"];

function maskGitHubToken(token) {
  const value = String(token || "");
  if (!value) return "MISSING";
  if (value.length <= 14) return `${value.slice(0, 4)}...${value.slice(-4)}`;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function redactGitHubHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => {
      if (key.toLowerCase() === "authorization") {
        const token = String(value || "").replace(/^Bearer\s+/i, "");
        return [key, `Bearer ${maskGitHubToken(token)}`];
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, redactGitHubHeaders(value)];
      }
      return [key, value];
    })
  );
}

function buildGitHubEndpoint(client, endpoint) {
  const baseURL = client?.defaults?.baseURL || GITHUB_API_BASE;
  return `${String(baseURL).replace(/\/+$/, "")}/${String(endpoint).replace(/^\/+/, "")}`;
}

function getGitHubRequestHeaders(client, config = {}) {
  const defaultHeaders = typeof client?.defaults?.headers?.toJSON === "function"
    ? client.defaults.headers.toJSON()
    : client?.defaults?.headers || {};
  const configHeaders = typeof config.headers?.toJSON === "function"
    ? config.headers.toJSON()
    : config.headers || {};

  return redactGitHubHeaders({
    ...defaultHeaders,
    ...configHeaders,
  });
}

function summarizeGitHubUser(user) {
  if (!user) return null;
  return {
    login: user.login,
    id: user.id,
    type: user.type,
    name: user.name,
    htmlUrl: user.html_url,
  };
}

function summarizeGitHubRepo(repo) {
  if (!repo) return null;
  return {
    id: repo.id,
    fullName: repo.full_name,
    private: repo.private,
    owner: repo.owner?.login,
    permissions: repo.permissions,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
  };
}

function summarizeGitHubHooks(hooks) {
  if (!Array.isArray(hooks)) return hooks;
  return {
    count: hooks.length,
    hooks: hooks.map((hook) => ({
      id: hook.id,
      name: hook.name,
      active: hook.active,
      events: hook.events,
      url: hook.config?.url,
      createdAt: hook.created_at,
    })),
  };
}

function summarizeGitHubResponse(endpoint, data) {
  if (endpoint === "/user") return summarizeGitHubUser(data);
  if (/^\/repos\/[^/]+\/[^/]+$/.test(endpoint)) return summarizeGitHubRepo(data);
  if (/^\/repos\/[^/]+\/[^/]+\/hooks$/.test(endpoint)) return summarizeGitHubHooks(data);
  return data;
}

function logGitHubRequestStart({ label, method, client, accessToken, repository, endpoint, config }) {
  console.log(`[GitHub Webhook Debug] ${label} START`, {
    token: maskGitHubToken(accessToken),
    repositoryOwner: repository?.owner,
    repositoryName: repository?.name,
    githubApiBaseUrl: client?.defaults?.baseURL || GITHUB_API_BASE,
    endpoint,
    fullGitHubApiEndpoint: buildGitHubEndpoint(client, endpoint),
    method: method.toUpperCase(),
    requestHeaders: getGitHubRequestHeaders(client, config),
    params: config?.params,
  });
}

function logGitHubRequestSuccess({ label, method, endpoint, response }) {
  console.log(`[GitHub Webhook Debug] ${label} SUCCESS`, {
    method: method.toUpperCase(),
    endpoint,
    httpStatus: response.status,
    result: summarizeGitHubResponse(endpoint, response.data),
  });
}

function logGitHubRequestFailure({ label, method, endpoint, error }) {
  console.error(`[GitHub Webhook Debug] ${label} FAILED`, {
    method: method.toUpperCase(),
    endpoint,
    httpStatus: error.response?.status,
    githubResponseBody: error.response?.data,
    githubErrorMessage: error.response?.data?.message,
    requestUrl: error.config?.url,
    requestMethod: error.config?.method,
    axiosErrorMessage: error.message,
  });
}

async function debugGitHubApiCall({
  client,
  accessToken,
  repository,
  method,
  endpoint,
  data,
  config = {},
  label,
  throwOnError = true,
}) {
  logGitHubRequestStart({ label, method, client, accessToken, repository, endpoint, config });

  try {
    const response = await client.request({
      method,
      url: endpoint,
      data,
      ...config,
    });
    logGitHubRequestSuccess({ label, method, endpoint, response });
    return { ok: true, response, data: response.data };
  } catch (error) {
    logGitHubRequestFailure({ label, method, endpoint, error });
    if (throwOnError) throw error;
    return {
      ok: false,
      error,
      status: error.response?.status,
      data: error.response?.data,
    };
  }
}

async function runGitHubRepositoryDiagnostics({ client, accessToken, repository, clientLabel }) {
  const repoEndpoint = `/repos/${repository.owner}/${repository.name}`;
  const hooksEndpoint = `${repoEndpoint}/hooks`;

  console.log("[GitHub Webhook Debug] Running GitHub repository diagnostics", {
    clientLabel,
    token: maskGitHubToken(accessToken),
    repositoryOwner: repository.owner,
    repositoryName: repository.name,
    githubApiBaseUrl: client?.defaults?.baseURL || GITHUB_API_BASE,
  });

  const userResult = await debugGitHubApiCall({
    client,
    accessToken,
    repository,
    method: "GET",
    endpoint: "/user",
    label: `${clientLabel} GET /user`,
    throwOnError: false,
  });

  const repoResult = await debugGitHubApiCall({
    client,
    accessToken,
    repository,
    method: "GET",
    endpoint: repoEndpoint,
    label: `${clientLabel} GET /repos/{owner}/{repo}`,
    throwOnError: false,
  });

  if (!repoResult.ok) {
    console.error("[GitHub Webhook Debug] Exact GitHub response body for GET /repos/{owner}/{repo}", {
      endpoint: repoEndpoint,
      repository: repository.fullName,
      httpStatus: repoResult.status,
      githubResponseBody: repoResult.data,
    });

    if (userResult.ok && repoResult.status === 404) {
      console.error("Authenticated user can access GitHub but cannot access repository.");
    }
  }

  const hooksResult = await debugGitHubApiCall({
    client,
    accessToken,
    repository,
    method: "GET",
    endpoint: hooksEndpoint,
    config: { params: { per_page: 100 } },
    label: `${clientLabel} GET /repos/{owner}/{repo}/hooks`,
    throwOnError: false,
  });

  return { userResult, repoResult, hooksResult };
}

function buildRepositoryAccessError({ repository, diagnostics, tokenLabel }) {
  const repoStatus = diagnostics?.repoResult?.status;
  const hooksStatus = diagnostics?.hooksResult?.status;
  const repoBody = diagnostics?.repoResult?.data;

  if (diagnostics?.userResult?.ok && repoStatus === 404) {
    return new Error(
      `GitHub repository not accessible: ${repository.fullName}. ` +
      `Authenticated user can access GitHub but cannot access repository. ` +
      `Token checked: ${tokenLabel}. ` +
      `Endpoint: GET /repos/${repository.owner}/${repository.name}. ` +
      `GitHub response: ${JSON.stringify(repoBody)}`
    );
  }

  if (!diagnostics?.userResult?.ok) {
    return new Error(
      `GitHub authentication failed before webhook creation for ${repository.fullName}. ` +
      `Token checked: ${tokenLabel}. ` +
      `GET /user returned HTTP ${diagnostics?.userResult?.status || "unknown"}. ` +
      `GitHub response: ${JSON.stringify(diagnostics?.userResult?.data || {})}`
    );
  }

  return new Error(
    `GitHub repository preflight failed for ${repository.fullName}. ` +
    `Token checked: ${tokenLabel}. ` +
    `GET /repos returned HTTP ${repoStatus || "unknown"}, GET /hooks returned HTTP ${hooksStatus || "unknown"}. ` +
    `GitHub response: ${JSON.stringify(repoBody || diagnostics?.hooksResult?.data || {})}`
  );
}

function createGitHubClient(accessToken) {
  return axios.create({
    baseURL: GITHUB_API_BASE,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DevOps-Hub",
    },
  });
}

function normalizeRepository({ owner, repo }) {
  const cleanOwner = String(owner || "").trim();
  const cleanRepo = String(repo || "").trim();

  if (!cleanOwner) throw new Error("owner is required");
  if (!cleanRepo) throw new Error("repo is required");

  return {
    owner: cleanOwner,
    name: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}`,
  };
}

function buildJenkinsWebhookUrl(jenkinsUrl) {
  const cleanUrl = String(jenkinsUrl || "").trim().replace(/\/+$/, "");
  if (!cleanUrl) throw new Error("Jenkins URL is not connected");

  return `${cleanUrl}/github-webhook/`;
}

/**
 * Validate webhook URL is public and does not contain private/localhost references
 */
/**
 * Validate repository parameters
 */
function validateRepositoryParams(owner, repo) {
  const errors = [];
  
  if (!owner || String(owner).trim().length === 0) {
    errors.push("Repository owner is empty");
  }
  
  if (!repo || String(repo).trim().length === 0) {
    errors.push("Repository name is empty");
  }
  
  if (owner && repo) {
    const ownerRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
    if (!ownerRegex.test(owner)) {
      errors.push(`Repository owner "${owner}" contains invalid characters`);
    }
    
    const repoRegex = /^[a-zA-Z0-9._-]+$/;
    if (!repoRegex.test(repo)) {
      errors.push(`Repository name "${repo}" contains invalid characters`);
    }
  }
  
  return errors;
}

function validateWebhookUrl(url) {
  const errors = [];
  
  if (!url || String(url).trim().length === 0) {
    errors.push("Webhook URL is empty");
  }

  const lowerUrl = String(url).toLowerCase();
  
  // Check for localhost variants
  if (lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")) {
    errors.push("Webhook URL contains localhost - must be publicly accessible");
  }

  // Check for private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (/\b(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url)) {
    errors.push("Webhook URL contains private IP address - must be publicly accessible");
  }

  // Check for common internal hostnames
  if (
    lowerUrl.includes(".local") ||
    lowerUrl.includes(".internal") ||
    lowerUrl.includes("::1") ||
    lowerUrl.includes("0.0.0.0")
  ) {
    errors.push("Webhook URL contains internal hostname - must be publicly accessible");
  }

  // Check URL format
  try {
    new URL(url);
  } catch {
    errors.push(`Webhook URL is not a valid URL: ${url}`);
  }

  return errors;
}

function getConnectedJenkinsWebhookUrl(jenkinsStatus, overrideUrl) {
  if (overrideUrl) {
    const cleanOverride = String(overrideUrl).trim().replace(/\/+$/, "");
    return cleanOverride.endsWith("/github-webhook")
      ? `${cleanOverride}/`
      : buildJenkinsWebhookUrl(cleanOverride);
  }
  if (!jenkinsStatus?.connected) {
    throw new Error("Connect Jenkins before configuring the GitHub webhook.");
  }

  return buildJenkinsWebhookUrl(jenkinsStatus.url);
}

function mapDelivery(delivery) {
  if (!delivery) return null;

  return {
    id: String(delivery.id || delivery.guid || ""),
    event: delivery.event,
    status: delivery.status || (delivery.status_code >= 200 && delivery.status_code < 300 ? "success" : "failed"),
    statusCode: delivery.status_code,
    deliveredAt: delivery.delivered_at ? new Date(delivery.delivered_at) : null,
    duration: delivery.duration,
    redelivery: Boolean(delivery.redelivery),
    action: delivery.action,
    request: delivery.request,
    response: delivery.response,
  };
}

function toPublicConfig(config, deliveries = [], localEvents = []) {
  if (!config) return null;
  const plain = typeof config.toObject === "function" ? config.toObject() : config;

  return {
    id: String(plain._id || plain.hookId),
    hookId: plain.hookId,
    status: plain.status,
    repository: plain.repository,
    webhookUrl: plain.webhookUrl,
    events: plain.events || WEBHOOK_EVENTS,
    active: Boolean(plain.active),
    githubHookUrl: plain.githubHookUrl,
    testUrl: plain.testUrl,
    metadata: plain.metadata || {},
    lastDelivery: plain.lastDelivery,
    recentDeliveries: plain.recentDeliveries || deliveries,
    deliveryValidatedAt: plain.deliveryValidatedAt,
    deliveryValidationStatus: plain.deliveryValidationStatus,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    deliveries,
    recentEvents: localEvents,
  };
}

async function findActiveConfig(userId, { fullName, webhookUrl }) {
  if (isDbConnected()) {
    return GitHubWebhookConfig.findOne({
      userId,
      status: "active",
      "repository.fullName": fullName,
      webhookUrl,
    }).lean();
  }

  return localDB.findActiveGitHubWebhookConfig(userId, { fullName, webhookUrl });
}

async function findConfig(userId, { owner, repo, hookId }) {
  if (isDbConnected()) {
    const query = { userId };
    if (hookId) query.hookId = Number(hookId);
    if (owner && repo) query["repository.fullName"] = `${owner}/${repo}`;

    return GitHubWebhookConfig.findOne(query).sort({ createdAt: -1 });
  }

  return localDB.findGitHubWebhookConfig(userId, { owner, repo, hookId });
}

async function listConfigs(userId, { owner, repo } = {}) {
  if (isDbConnected()) {
    const query = { userId };
    if (owner && repo) query["repository.fullName"] = `${owner}/${repo}`;
    return GitHubWebhookConfig.find(query).sort({ createdAt: -1 }).lean();
  }

  const configs = localDB.findGitHubWebhookConfigs(userId);
  if (!owner || !repo) return configs;
  return configs.filter((config) => config.repository?.fullName === `${owner}/${repo}`);
}

async function updateStoredDelivery(userId, config, delivery, recentDeliveries = []) {
  const deliveryValidationStatus = delivery?.statusCode >= 200 && delivery?.statusCode < 300 ? "success" : "failed";
  const updates = {
    lastDelivery: delivery,
    recentDeliveries: recentDeliveries.length ? recentDeliveries : (delivery ? [delivery] : []),
    deliveryValidatedAt: new Date(),
    deliveryValidationStatus,
    updatedAt: new Date(),
  };

  if (isDbConnected()) {
    return GitHubWebhookConfig.findOneAndUpdate(
      { userId, hookId: config.hookId },
      updates,
      { new: true }
    ).lean();
  }

  return localDB.updateGitHubWebhookConfig(userId, config._id || config.hookId, updates);
}

async function fetchDeliveries(client, { owner, repo, hookId, accessToken, repository, clientLabel = "GitHub API" }) {
  const endpoint = `/repos/${owner}/${repo}/hooks/${hookId}/deliveries`;
  try {
    const result = await debugGitHubApiCall({
      client,
      accessToken,
      repository: repository || { owner, name: repo, fullName: `${owner}/${repo}` },
      method: "GET",
      endpoint,
      config: {
        params: { per_page: 10 },
      },
      label: `${clientLabel} GET /repos/{owner}/{repo}/hooks/{hookId}/deliveries`,
    });
    return result.response.data.map(mapDelivery);
  } catch (error) {
    console.warn("[GitHub Webhook] Could not fetch deliveries:", error.response?.data?.message || error.message);
    return [];
  }
}

async function pingWebhook(client, { owner, repo, hookId, accessToken, repository, clientLabel = "GitHub API" }) {
  const endpoint = `/repos/${owner}/${repo}/hooks/${hookId}/pings`;
  await debugGitHubApiCall({
    client,
    accessToken,
    repository: repository || { owner, name: repo, fullName: `${owner}/${repo}` },
    method: "POST",
    endpoint,
    label: `${clientLabel} POST /repos/{owner}/{repo}/hooks/{hookId}/pings`,
  });
}

async function fetchRepositoryHooks(client, { owner, repo, accessToken, repository, clientLabel = "GitHub API" }) {
  const endpoint = `/repos/${owner}/${repo}/hooks`;
  const result = await debugGitHubApiCall({
    client,
    accessToken,
    repository: repository || { owner, name: repo, fullName: `${owner}/${repo}` },
    method: "GET",
    endpoint,
    config: {
      params: { per_page: 100 },
    },
    label: `${clientLabel} GET /repos/{owner}/{repo}/hooks`,
  });
  return result.response;
}

async function fetchLocalEvents({ owner, repo }) {
  if (!isDbConnected()) return [];

  return Webhook.find({ "repository.fullName": `${owner}/${repo}` })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("-rawPayload")
    .lean()
    .catch(() => []);
}

/**
 * Remove stale webhook record from database when GitHub webhook no longer exists
 */
async function removeStaleWebhookRecord(userId, config) {
  console.log("[GitHub Webhook] Removing stale webhook record from database", {
    repository: config.repository.fullName,
    staleHookId: config.hookId,
    storedWebhookUrl: config.webhookUrl,
  });

  if (isDbConnected()) {
    await GitHubWebhookConfig.deleteOne({
      userId,
      hookId: config.hookId,
    }).catch((error) => {
      console.warn("[GitHub Webhook] Failed to remove stale record", {
        hookId: config.hookId,
        error: error.message,
      });
    });
  } else {
    localDB.deleteGitHubWebhookConfig(userId, config._id || config.hookId).catch((error) => {
      console.warn("[GitHub Webhook] Failed to remove stale record (local DB)", {
        hookId: config.hookId,
        error: error.message,
      });
    });
  }
}

async function updatePipelineWebhookStage(userId, config) {
  if (!isDbConnected()) return;

  await Pipeline.updateMany(
    {
      userId,
      provider: "jenkins",
      "repository.owner": config.repository.owner,
      "repository.name": config.repository.name,
    },
    {
      $set: {
        githubWebhook: {
          hookId: config.hookId,
          webhookUrl: config.webhookUrl,
          events: config.events,
          connectedAt: new Date(),
          deliveryValidationStatus: config.deliveryValidationStatus,
        },
        "stages.$[stage].status": "success",
        "stages.$[stage].logs": [`Configured GitHub webhook ${config.hookId}`],
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ "stage.name": "Configure GitHub Webhook" }] }
  ).catch((error) => {
    console.warn("[GitHub Webhook] Failed to update pipeline stage:", error.message);
  });
}

async function markDeploymentWebhookConfigured(userId, config) {
  if (!isDbConnected()) return null;

  const update = {
    "setup.githubWebhookConfigured": true,
    "setup.githubWebhookConfiguredAt": new Date(),
    "setup.githubWebhookUrl": config.webhookUrl,
    "setup.githubWebhookHookId": config.hookId,
    "setup.updatedAt": new Date(),
    updatedAt: new Date(),
    $push: {
      logs: {
        timestamp: new Date(),
        level: "info",
        message: `[GitHub Webhook] Configured webhook ${config.hookId}`,
      },
    },
  };
  const exactQuery = {
    userId,
    owner: config.repository.owner,
    repository: config.repository.name,
    ...(config.repository.branch ? { branch: config.repository.branch } : {}),
  };
  const fallbackQuery = {
    userId,
    owner: config.repository.owner,
    repository: config.repository.name,
  };

  const deployment = await Deployment.findOneAndUpdate(
    exactQuery,
    update,
    { new: true, sort: { updatedAt: -1 } }
  ).lean();

  if (deployment || !config.repository.branch) return deployment;

  return Deployment.findOneAndUpdate(
    fallbackQuery,
    update,
    { new: true, sort: { updatedAt: -1 } }
  ).lean();
}

/**
 * Query GitHub API to find existing webhooks matching the target webhook URL
 * This discovers webhooks that actually exist on GitHub, not just stored in database
 * Returns first matching webhook or null if not found
 */
async function findExistingGitHubWebhookOnGitHub(userId, owner, repo, targetWebhookUrl) {
  try {
    const accessToken = await getGitHubAccessToken(userId);
    const client = createGitHubClient(accessToken);
    const repository = { owner, name: repo, fullName: `${owner}/${repo}` };
    
    console.log("[GitHub Webhook Discovery] Querying GitHub API for existing webhooks", {
      repository: `${owner}/${repo}`,
      targetWebhookUrl,
    });
    
    const response = await fetchRepositoryHooks(client, {
      owner,
      repo,
      accessToken,
      repository,
      clientLabel: "User OAuth token discovery",
    });
    
    const hooks = Array.isArray(response.data) ? response.data : [];
    console.log("[GitHub Webhook Discovery] Found GitHub hooks", {
      repository: `${owner}/${repo}`,
      totalHooks: hooks.length,
      hookIds: hooks.map(h => h.id),
    });
    
    // Find webhook matching our target URL
    const matchingHook = hooks.find(hook => {
      const hookUrl = hook.config?.url || "";
      const targetsMatch = hookUrl === targetWebhookUrl;
      if (targetsMatch) {
        console.log("[GitHub Webhook Discovery] Found matching webhook on GitHub", {
          hookId: hook.id,
          configUrl: hook.config?.url,
          active: hook.active,
          events: hook.events,
        });
      }
      return targetsMatch;
    });
    
    if (matchingHook) {
      return {
        hookId: matchingHook.id,
        url: matchingHook.config?.url,
        active: matchingHook.active,
        events: matchingHook.events,
        createdAt: matchingHook.created_at,
      };
    }
    
    console.log("[GitHub Webhook Discovery] No matching webhook found on GitHub", {
      repository: `${owner}/${repo}`,
      targetWebhookUrl,
      availableUrls: hooks.map(h => h.config?.url),
    });
    return null;
  } catch (error) {
    const status = error.response?.status;
    console.error("[GitHub Webhook Discovery] Failed to query GitHub webhooks", {
      repository: `${owner}/${repo}`,
      httpStatus: status,
      errorMessage: error.response?.data?.message || error.message,
    });
    
    if (status === 404) {
      console.warn("[GitHub Webhook Discovery] Repository not found or inaccessible", {
        repository: `${owner}/${repo}`,
      });
      return null;
    }
    
    // Return null on error to allow fallback to creating new webhook
    return null;
  }
}

export async function createGitHubWebhook(userId, payload = {}) {
  // ============================================================================
  // STEP 0: VALIDATE INPUTS
  // ============================================================================
  console.log("[GitHub Webhook] ========== WEBHOOK CREATION START ==========");
  console.log("[GitHub Webhook] Input Parameters:", {
    userId: userId ? "present" : "MISSING",
    payloadOwner: payload.owner,
    payloadRepo: payload.repo,
    payloadBranch: payload.branch || "main",
    payloadWebhookUrl: payload.webhookUrl,
  });
  
  let repository;
  try {
    repository = normalizeRepository(payload);
    
    // Validate repository parameters
    const repoErrors = validateRepositoryParams(repository.owner, repository.name);
    if (repoErrors.length > 0) {
      console.error("[GitHub Webhook] Repository validation failed", {
        owner: repository.owner,
        repo: repository.name,
        errors: repoErrors,
      });
      throw new Error(`Repository validation failed: ${repoErrors.join("; ")}`);
    }
    
    console.log("[GitHub Webhook] Repository validated", {
      owner: repository.owner,
      repo: repository.name,
      fullName: repository.fullName,
      url: repository.url,
    });
  } catch (error) {
    console.error("[GitHub Webhook] Repository normalization/validation failed", {
      owner: payload.owner,
      repo: payload.repo,
      error: error.message,
    });
    throw error;
  }

  let jenkins;
  try {
    jenkins = await getJenkinsStatus(userId);
    if (!jenkins?.status?.connected) {
      console.error("[GitHub Webhook] Jenkins is not connected", {
        jenkinsConnected: jenkins?.status?.connected,
        jenkinsUrl: jenkins?.status?.url,
      });
      throw new Error("Jenkins is not connected - cannot create GitHub webhook without valid Jenkins URL");
    }
    console.log("[GitHub Webhook] Jenkins status verified", {
      connected: true,
      jenkinsUrl: jenkins.status.url,
    });
  } catch (error) {
    console.error("[GitHub Webhook] Jenkins status check failed", {
      error: error.message,
    });
    throw error;
  }

  let webhookUrl;
  try {
    webhookUrl = getConnectedJenkinsWebhookUrl(jenkins.status, payload.webhookUrl);
    
    // Validate webhook URL
    const urlErrors = validateWebhookUrl(webhookUrl);
    if (urlErrors.length > 0) {
      console.error("[GitHub Webhook] Webhook URL validation failed", {
        webhookUrl,
        errors: urlErrors,
      });
      throw new Error(`Invalid webhook URL: ${urlErrors.join("; ")}`);
    }
    
    console.log("[GitHub Webhook] Webhook URL validated", {
      webhookUrl,
      isPublic: true,
    });
  } catch (error) {
    console.error("[GitHub Webhook] Webhook URL construction/validation failed", {
      error: error.message,
    });
    throw error;
  }

  // ============================================================================
  // STEP 1: CHECK DATABASE FOR EXISTING CONFIG
  // ============================================================================
  console.log("[GitHub Webhook] Checking database for existing config", {
    repository: repository.fullName,
    webhookUrl,
  });

  const dbExisting = await findActiveConfig(userId, {
    fullName: repository.fullName,
    webhookUrl,
  });

  if (dbExisting) {
    console.log("[GitHub Webhook] Found existing config in database", {
      repository: repository.fullName,
      storedHookId: dbExisting.hookId,
      storedWebhookUrl: dbExisting.webhookUrl,
      status: dbExisting.status,
      active: dbExisting.active,
    });
  } else {
    console.log("[GitHub Webhook] No existing config found in database", {
      repository: repository.fullName,
    });
  }

  // ============================================================================
  // STEP 2: GET GITHUB ACCESS TOKEN AND CREATE CLIENTS
  // ============================================================================
  let accessToken;
  let writeToken;
  let userReadClient;
  let readClient;
  let writeClient;
  
  try {
    accessToken = await getGitHubAccessToken(userId);
    if (!accessToken) {
      throw new Error("GitHub access token not found or invalid");
    }

    writeToken = getGitHubWriteToken();
    if (!writeToken) {
      throw new Error("GITHUB_TOKEN environment variable missing or invalid");
    }
    
    userReadClient = createGitHubClient(accessToken);
    readClient = createGitHubClient(writeToken);
    writeClient = createGitHubClient(writeToken);
    
    console.log("[GitHub Webhook] GitHub clients created successfully", {
      userOAuthToken: maskGitHubToken(accessToken),
      serverWriteToken: maskGitHubToken(writeToken),
      readClientTokenSource: "process.env.GITHUB_TOKEN",
      writeClientTokenSource: "process.env.GITHUB_TOKEN",
      note: "Repository webhook API calls use the server GITHUB_TOKEN; user OAuth token is checked for identity diagnostics.",
    });
  } catch (error) {
    console.error("[GitHub Webhook] Failed to create GitHub clients", {
      error: error.message,
      userId: userId ? "present" : "MISSING",
    });
    throw error;
  }

  const userDiagnostics = await runGitHubRepositoryDiagnostics({
    client: userReadClient,
    accessToken,
    repository,
    clientLabel: "User OAuth token",
  });

  if (userDiagnostics.userResult.ok && userDiagnostics.repoResult.status === 404) {
    console.warn("[GitHub Webhook Debug] User OAuth token cannot access repository; continuing with server GITHUB_TOKEN for webhook operations", {
      repository: repository.fullName,
      userOAuthToken: maskGitHubToken(accessToken),
      serverWriteToken: maskGitHubToken(writeToken),
    });
  }

  const writeDiagnostics = await runGitHubRepositoryDiagnostics({
    client: readClient,
    accessToken: writeToken,
    repository,
    clientLabel: "Server GITHUB_TOKEN",
  });

  if (!writeDiagnostics.repoResult.ok || !writeDiagnostics.hooksResult.ok) {
    throw buildRepositoryAccessError({
      repository,
      diagnostics: writeDiagnostics,
      tokenLabel: "process.env.GITHUB_TOKEN",
    });
  }

  // ============================================================================
  // STEP 3: QUERY GITHUB API TO GET ALL EXISTING WEBHOOKS
  // ============================================================================
  console.log("[GitHub Webhook] Querying GitHub API for all webhooks", {
    repository: repository.fullName,
    targetWebhookUrl: webhookUrl,
    endpoint: `/repos/${repository.owner}/${repository.name}/hooks`,
  });

  let allGitHubHooks = [];
  let matchingGitHubHook = null;

  try {
    const hooksEndpoint = `/repos/${repository.owner}/${repository.name}/hooks`;
    const hooksResponse = await fetchRepositoryHooks(readClient, {
      owner: repository.owner,
      repo: repository.name,
      accessToken: writeToken,
      repository,
      clientLabel: "Server GITHUB_TOKEN",
    });

    allGitHubHooks = Array.isArray(hooksResponse.data) ? hooksResponse.data : [];
    
    console.log("[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS", {
      endpoint: hooksEndpoint,
      repository: repository.fullName,
      httpStatus: hooksResponse.status,
      totalHooks: allGitHubHooks.length,
      hookIds: allGitHubHooks.map(h => h.id),
      hookUrls: allGitHubHooks.map(h => h.config?.url),
    });

    // Find webhook matching our target URL
    matchingGitHubHook = allGitHubHooks.find(hook => {
      const hookUrl = hook.config?.url || "";
      return hookUrl === webhookUrl;
    });

    if (matchingGitHubHook) {
      console.log("[GitHub Webhook] Found matching webhook on GitHub by URL", {
        repository: repository.fullName,
        foundHookId: matchingGitHubHook.id,
        foundWebhookUrl: matchingGitHubHook.config?.url,
        active: matchingGitHubHook.active,
        events: matchingGitHubHook.events,
        createdAt: matchingGitHubHook.created_at,
      });
    } else {
      console.log("[GitHub Webhook] No matching webhook found on GitHub by URL", {
        repository: repository.fullName,
        targetWebhookUrl: webhookUrl,
        availableHooks: allGitHubHooks.map(h => ({
          id: h.id,
          url: h.config?.url,
          active: h.active,
          events: h.events,
        })),
      });
    }
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const endpoint = `/repos/${repository.owner}/${repository.name}/hooks`;
    
    console.error("[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED", {
      repository: repository.fullName,
      endpoint,
      httpStatus: status,
      githubErrorMessage: errorData?.message,
      githubErrors: errorData?.errors,
      errorCode: errorData?.error,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
    });

    if (status === 404) {
      console.error("[GitHub Webhook] Repository not found on GitHub", {
        repository: repository.fullName,
        owner: repository.owner,
        repo: repository.name,
        message: "The repository does not exist on GitHub or you do not have access",
        troubleshooting: [
          "Verify the repository owner is correct (case-sensitive)",
          "Verify the repository name is correct (case-sensitive)",
          "If private, ensure GitHub token has access to the repository",
          "Ensure GitHub token has not expired",
        ],
      });
      throw new Error(
        `GitHub repository not found: ${repository.fullName}. ` +
        `The repository may not exist on GitHub or your token may not have access to it. ` +
        `Endpoint: GET ${endpoint}. ` +
        `GitHub Error: ${errorData?.message}`
      );
    }

    if (status === 401) {
      console.error("[GitHub Webhook] GitHub authentication failed", {
        httpStatus: 401,
        endpoint,
        message: "GitHub token is invalid or expired",
      });
      throw new Error(
        `GitHub authentication failed (HTTP 401). Your GitHub token may be invalid or expired. ` +
        `Endpoint: GET ${endpoint}. ` +
        `Error: ${errorData?.message}`
      );
    }

    if (status === 403) {
      console.error("[GitHub Webhook] GitHub permission denied", {
        httpStatus: 403,
        endpoint,
        message: "Insufficient permissions to access repository webhooks",
      });
      throw new Error(
        `GitHub permission denied (HTTP 403). Your token may lack repo:admin_hook permissions. ` +
        `Endpoint: GET ${endpoint}. ` +
        `Error: ${errorData?.message}`
      );
    }

    // For other errors, rethrow with context
    throw new Error(
      `Failed to query GitHub webhooks for ${repository.fullName}: ` +
      `${errorData?.message || error.message} (HTTP ${status}). ` +
      `Endpoint: GET ${endpoint}`
    );
  }

  // ============================================================================
  // STEP 3a: IF WEBHOOK EXISTS ON GITHUB, REUSE IT
  // ============================================================================
  if (matchingGitHubHook) {
    console.log("[GitHub Webhook] Webhook exists on GitHub - reusing (idempotent)", {
      repository: repository.fullName,
      reusingHookId: matchingGitHubHook.id,
    });

    // Fetch recent deliveries
    const deliveries = await fetchDeliveries(readClient, {
      owner: repository.owner,
      repo: repository.name,
      hookId: matchingGitHubHook.id,
      accessToken: writeToken,
      repository,
      clientLabel: "Server GITHUB_TOKEN",
    });
    const localEvents = await fetchLocalEvents(repository);

    // If database config exists and matches, return it
    if (dbExisting && dbExisting.hookId === matchingGitHubHook.id) {
      console.log("[GitHub Webhook] Database config already matches GitHub webhook", {
        repository: repository.fullName,
        hookId: matchingGitHubHook.id,
        message: "No action needed - everything in sync",
      });

      const deployment = await markDeploymentWebhookConfigured(userId, dbExisting);
      console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (REUSED) ==========");
      return {
        success: true,
        duplicate: true,
        message: "GitHub Webhook Connected (reused existing)",
        webhook: toPublicConfig(dbExisting, deliveries, localEvents),
        deploymentId: deployment?.deploymentId || null,
      };
    }

    // Database config doesn't match or is missing - update it with the correct GitHub webhook
    console.log("[GitHub Webhook] Updating database to match GitHub webhook", {
      repository: repository.fullName,
      githubHookId: matchingGitHubHook.id,
      reason: dbExisting ? "database hookId mismatch" : "no database record",
      dbHookId: dbExisting?.hookId,
    });

    const configData = {
      userId,
      hookId: matchingGitHubHook.id,
      status: "active",
      repository: {
        ...repository,
        branch: payload.branch || "main",
      },
      webhookUrl,
      events: WEBHOOK_EVENTS,
      active: Boolean(matchingGitHubHook.active),
      githubHookUrl: `https://github.com/${repository.owner}/${repository.name}/settings/hooks/${matchingGitHubHook.id}`,
      metadata: {
        name: "web",
        type: "web",
        createdBy: "devops-dashboard",
        jenkinsUrl: jenkins.status?.url,
        subscribedEvents: WEBHOOK_EVENTS,
        discoveredFromGitHubAPI: true,
        discoveredAt: new Date(),
      },
      lastDelivery: deliveries[0] || null,
      recentDeliveries: deliveries,
      deliveryValidatedAt: new Date(),
      deliveryValidationStatus: deliveries.some(d => d.statusCode >= 200 && d.statusCode < 300) ? "success" : "pending",
      createdInGitHubAt: matchingGitHubHook.created_at ? new Date(matchingGitHubHook.created_at) : new Date(),
    };

    const config = isDbConnected()
      ? dbExisting
        ? await GitHubWebhookConfig.findOneAndUpdate(
            { userId, hookId: dbExisting.hookId },
            configData,
            { new: true }
          )
        : await GitHubWebhookConfig.findOneAndUpdate(
            { userId, "repository.fullName": repository.fullName, webhookUrl },
            configData,
            { new: true, upsert: true, setDefaultsOnInsert: true }
          )
      : dbExisting
        ? localDB.updateGitHubWebhookConfig(userId, dbExisting._id || dbExisting.hookId, configData)
        : localDB.createGitHubWebhookConfig(configData);

    await updatePipelineWebhookStage(userId, config);
    const deployment = await markDeploymentWebhookConfigured(userId, config);

    console.log("[GitHub Webhook] Database updated successfully", {
      repository: repository.fullName,
      hookId: config.hookId,
      configId: config._id || config.hookId,
    });
    console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (DATABASE SYNCED) ==========");

    return {
      success: true,
      duplicate: true,
      message: "GitHub Webhook Connected (discovered from GitHub)",
      webhook: toPublicConfig(config, deliveries, localEvents),
      deploymentId: deployment?.deploymentId || null,
    };
  }

  // ============================================================================
  // STEP 3b: IF STORED WEBHOOK ID EXISTS IN DATABASE BUT NOT ON GITHUB, REMOVE IT
  // ============================================================================
  if (dbExisting) {
    console.log("[GitHub Webhook] Checking if stored webhook ID still exists on GitHub", {
      repository: repository.fullName,
      storedHookId: dbExisting.hookId,
    });

    const storedHookExistsOnGitHub = allGitHubHooks.some(h => h.id === dbExisting.hookId);

    if (!storedHookExistsOnGitHub) {
      console.warn("[GitHub Webhook] Stored webhook ID not found on GitHub - webhook was deleted", {
        repository: repository.fullName,
        staleHookId: dbExisting.hookId,
        action: "removing stale record and creating new webhook",
      });

      await removeStaleWebhookRecord(userId, dbExisting);
      // Continue to create new webhook below
    }
  }

  // ============================================================================
  // STEP 4: CREATE NEW WEBHOOK ON GITHUB
  // ============================================================================
  console.log("[GitHub Webhook] Creating new webhook on GitHub", {
    repository: repository.fullName,
    webhookUrl,
    events: WEBHOOK_EVENTS,
    endpoint: `/repos/${repository.owner}/${repository.name}/hooks`,
  });

  let hook;
  try {
    const createEndpoint = `/repos/${repository.owner}/${repository.name}/hooks`;
    console.log("[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks STARTING", {
      endpoint: createEndpoint,
      repository: repository.fullName,
      requestPayload: {
        name: "web",
        active: true,
        events: WEBHOOK_EVENTS,
        config: {
          url: webhookUrl,
          content_type: "json",
          insecure_ssl: "0",
        },
      },
    });

    const requestPayload = {
      name: "web",
      active: true,
      events: WEBHOOK_EVENTS,
      config: {
        url: webhookUrl,
        content_type: "json",
        insecure_ssl: "0",
      },
    };

    const createResult = await debugGitHubApiCall({
      client: writeClient,
      accessToken: writeToken,
      repository,
      method: "POST",
      endpoint: createEndpoint,
      data: requestPayload,
      label: "Server GITHUB_TOKEN POST /repos/{owner}/{repo}/hooks",
    });
    const response = createResult.response;
    hook = response.data;

    console.log("[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks SUCCESS", {
      endpoint: createEndpoint,
      repository: repository.fullName,
      httpStatus: response.status,
      newHookId: hook.id,
      webhookUrl: hook.config?.url,
      active: hook.active,
      events: hook.events,
      createdAt: hook.created_at,
      githubHookUrl: hook.url,
    });
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const endpoint = `/repos/${repository.owner}/${repository.name}/hooks`;

    console.error("[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks FAILED", {
      endpoint,
      repository: repository.fullName,
      httpStatus: status,
      githubErrorMessage: errorData?.message,
      githubErrors: errorData?.errors,
      errorCode: errorData?.error,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
    });

    // ========================================================================
    // HANDLE 404 ERRORS - REPOSITORY OR WEBHOOK NOT FOUND
    // ========================================================================
    if (status === 404) {
      console.error("[GitHub Webhook] GitHub API returned 404 Not Found when creating webhook", {
        endpoint,
        repository: repository.fullName,
        owner: repository.owner,
        repo: repository.name,
        githubErrorMessage: errorData?.message,
        troubleshooting: [
          "Repository may not exist on GitHub",
          "Repository may be private without sufficient access",
          "Repository owner or name may be incorrect (case-sensitive)",
          "GitHub token may be invalid or expired",
          "GitHub token may lack repo:admin_hook permissions",
        ],
      });

      throw new Error(
        `GitHub returned 404 Not Found when creating webhook. ` +
        `Endpoint: POST ${endpoint}. ` +
        `Repository: ${repository.fullName}. ` +
        `The repository may not exist, may be private with insufficient access, or the owner/name may be incorrect. ` +
        `GitHub Error: ${errorData?.message}`
      );
    }

    // ========================================================================
    // HANDLE 422 VALIDATION ERROR - LIKELY WEBHOOK ALREADY EXISTS
    // ========================================================================
    if (status === 422) {
      console.warn("[GitHub Webhook] GitHub returned 422 Validation Failed", {
        repository: repository.fullName,
        webhookUrl,
        httpStatus: 422,
        endpoint,
        githubErrorMessage: errorData?.message,
        githubErrors: errorData?.errors,
      });

      // The 422 could mean webhook already exists - query again to double-check
      console.log("[GitHub Webhook] Rechecking GitHub for webhooks after 422 error", {
        repository: repository.fullName,
      });

      try {
        const retryResponse = await fetchRepositoryHooks(readClient, {
          owner: repository.owner,
          repo: repository.name,
          accessToken: writeToken,
          repository,
          clientLabel: "Server GITHUB_TOKEN retry after 422",
        });

        const retryHooks = Array.isArray(retryResponse.data) ? retryResponse.data : [];
        const retryMatchingHook = retryHooks.find(h => h.config?.url === webhookUrl);

        if (retryMatchingHook) {
          console.log("[GitHub Webhook] Found webhook on retry after 422 - webhook exists on GitHub", {
            repository: repository.fullName,
            foundHookId: retryMatchingHook.id,
            webhookUrl: retryMatchingHook.config?.url,
          });

          // Webhook exists - use it
          const deliveries = await fetchDeliveries(readClient, {
            owner: repository.owner,
            repo: repository.name,
            hookId: retryMatchingHook.id,
            accessToken: writeToken,
            repository,
            clientLabel: "Server GITHUB_TOKEN",
          });
          const localEvents = await fetchLocalEvents(repository);

          const configData = {
            userId,
            hookId: retryMatchingHook.id,
            status: "active",
            repository: {
              ...repository,
              branch: payload.branch || "main",
            },
            webhookUrl,
            events: WEBHOOK_EVENTS,
            active: Boolean(retryMatchingHook.active),
            githubHookUrl: `https://github.com/${repository.owner}/${repository.name}/settings/hooks/${retryMatchingHook.id}`,
            metadata: {
              name: "web",
              type: "web",
              createdBy: "devops-dashboard",
              jenkinsUrl: jenkins.status?.url,
              subscribedEvents: WEBHOOK_EVENTS,
              discoveredFromGitHubAPI: true,
              recoveredFrom422: true,
              discoveredAt: new Date(),
            },
            lastDelivery: deliveries[0] || null,
            recentDeliveries: deliveries,
            deliveryValidatedAt: new Date(),
            deliveryValidationStatus: deliveries.some(d => d.statusCode >= 200 && d.statusCode < 300) ? "success" : "pending",
            createdInGitHubAt: retryMatchingHook.created_at ? new Date(retryMatchingHook.created_at) : new Date(),
          };

          // Remove old stale record if different hookId
          if (dbExisting && dbExisting.hookId !== retryMatchingHook.id) {
            await removeStaleWebhookRecord(userId, dbExisting);
          }

          const config = isDbConnected()
            ? await GitHubWebhookConfig.findOneAndUpdate(
                { userId, "repository.fullName": repository.fullName, webhookUrl },
                configData,
                { new: true, upsert: true, setDefaultsOnInsert: true }
              )
            : localDB.createGitHubWebhookConfig(configData);

          await updatePipelineWebhookStage(userId, config);
          const deployment = await markDeploymentWebhookConfigured(userId, config);

          console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (RECOVERED FROM 422) ==========");
          return {
            success: true,
            duplicate: true,
            message: "GitHub Webhook Connected (recovered from 422 - webhook exists)",
            webhook: toPublicConfig(config, deliveries, localEvents),
            deploymentId: deployment?.deploymentId || null,
          };
        } else {
          // Still no webhook found - report the original 422 error
          console.error("[GitHub Webhook] 422 Error: Could not create webhook and no matching webhook found on retry", {
            repository: repository.fullName,
            webhookUrl,
            endpoint,
            githubErrorMessage: errorData?.message,
            githubErrors: errorData?.errors,
            availableHookCount: retryHooks.length,
          });

          throw new Error(
            `GitHub webhook creation failed with validation error: ${errorData?.message || "Unknown validation error"}. ` +
            `Errors: ${JSON.stringify(errorData?.errors || [])}. ` +
            `Endpoint: POST ${endpoint}. ` +
            `This usually means: 1) webhook already exists with different URL, 2) webhook URL is invalid, or 3) insufficient permissions.`
          );
        }
      } catch (retryError) {
        console.error("[GitHub Webhook] Failed to retry after 422 error", {
          repository: repository.fullName,
          endpoint,
          retryError: retryError.message,
          originalError: errorData?.message,
        });

        throw new Error(
          `GitHub webhook creation failed with validation error: ${errorData?.message || "Unknown validation error"}. ` +
          `Retry check also failed: ${retryError.message}. ` +
          `Endpoint: POST ${endpoint}`
        );
      }
    }

    // ========================================================================
    // HANDLE 401/403 AUTHENTICATION/PERMISSION ERRORS
    // ========================================================================
    if (status === 401) {
      console.error("[GitHub Webhook] GitHub authentication failed", {
        httpStatus: 401,
        endpoint,
        message: "GitHub token is invalid or expired",
      });
      throw new Error(
        `GitHub authentication failed (HTTP 401). Your GitHub token may be invalid or expired. ` +
        `Endpoint: POST ${endpoint}. ` +
        `Error: ${errorData?.message}`
      );
    }

    if (status === 403) {
      console.error("[GitHub Webhook] GitHub permission denied", {
        httpStatus: 403,
        endpoint,
        message: "Insufficient permissions to create webhook",
        requiredPermissions: ["repo:admin_hook", "admin:repo_hook"],
      });
      throw new Error(
        `GitHub permission denied (HTTP 403). Your token may lack repo:admin_hook permissions. ` +
        `Endpoint: POST ${endpoint}. ` +
        `Error: ${errorData?.message}`
      );
    }

    // ========================================================================
    // HANDLE OTHER GITHUB API ERRORS
    // ========================================================================
    console.error("[GitHub Webhook] Failed to create webhook on GitHub (other error)", {
      endpoint,
      repository: repository.fullName,
      owner: repository.owner,
      repo: repository.name,
      webhookUrl,
      httpStatus: status,
      githubErrorMessage: errorData?.message,
      githubErrors: errorData?.errors,
      fullErrorData: errorData,
      axiosErrorMessage: error.message,
    });

    throw new Error(
      `Failed to create GitHub webhook for ${repository.fullName}: ` +
      `${errorData?.message || error.message} (HTTP ${status}). ` +
      `Endpoint: POST ${endpoint}. ` +
      `Details: ${JSON.stringify(errorData?.errors || [])}`
    );
  }

  // ============================================================================
  // STEP 5: VALIDATE NEW WEBHOOK WITH PING AND DELIVERIES
  // ============================================================================
  console.log("[GitHub Webhook] Validating new webhook with ping and deliveries", {
    repository: repository.fullName,
    hookId: hook.id,
  });

  let deliveryValidationStatus = "pending";
  let deliveries = [];
  let lastDelivery = null;

  try {
    const pingEndpoint = `/repos/${repository.owner}/${repository.name}/hooks/${hook.id}/pings`;
    console.log("[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks/{hookId}/pings STARTING", {
      endpoint: pingEndpoint,
      repository: repository.fullName,
      hookId: hook.id,
    });

    await pingWebhook(writeClient, {
      owner: repository.owner,
      repo: repository.name,
      hookId: hook.id,
      accessToken: writeToken,
      repository,
      clientLabel: "Server GITHUB_TOKEN",
    });

    console.log("[GitHub Webhook] Ping request sent to webhook successfully", {
      repository: repository.fullName,
      hookId: hook.id,
      endpoint: pingEndpoint,
    });

    // Wait for delivery to be recorded
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const deliveriesEndpoint = `/repos/${repository.owner}/${repository.name}/hooks/${hook.id}/deliveries`;
    console.log("[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks/{hookId}/deliveries STARTING", {
      endpoint: deliveriesEndpoint,
      repository: repository.fullName,
      hookId: hook.id,
    });

    deliveries = await fetchDeliveries(writeClient, {
      owner: repository.owner,
      repo: repository.name,
      hookId: hook.id,
      accessToken: writeToken,
      repository,
      clientLabel: "Server GITHUB_TOKEN",
    });

    lastDelivery = deliveries[0] || null;
    deliveryValidationStatus =
      lastDelivery && lastDelivery.statusCode >= 200 && lastDelivery.statusCode < 300
        ? "success"
        : "pending";

    console.log("[GitHub Webhook] Webhook validation complete", {
      repository: repository.fullName,
      hookId: hook.id,
      deliveryValidationStatus,
      recentDeliveries: deliveries.length,
      lastDeliveryStatus: lastDelivery?.status,
      lastDeliveryStatusCode: lastDelivery?.statusCode,
    });
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    
    deliveryValidationStatus = "failed";
    
    // 404 on validation is non-critical - webhook was created successfully
    if (status === 404) {
      console.warn("[GitHub Webhook] Webhook validation encountered 404 (non-critical)", {
        repository: repository.fullName,
        hookId: hook.id,
        httpStatus: 404,
        githubErrorMessage: errorData?.message,
        note: "Webhook was created successfully on GitHub. Validation delivery check failed, but this is non-critical.",
      });
    } else {
      console.warn("[GitHub Webhook] Webhook validation failed (non-critical)", {
        repository: repository.fullName,
        hookId: hook.id,
        httpStatus: status,
        error: errorData?.message || error.message,
        note: "Webhook was created successfully, but validation delivery check failed. This is non-critical.",
      });
    }
  }

  // ============================================================================
  // STEP 6: SAVE WEBHOOK TO DATABASE
  // ============================================================================
  console.log("[GitHub Webhook] Saving webhook to database", {
    repository: repository.fullName,
    hookId: hook.id,
  });

  const configData = {
    userId,
    hookId: hook.id,
    status: "active",
    repository: {
      ...repository,
      branch: payload.branch || "main",
    },
    webhookUrl,
    events: WEBHOOK_EVENTS,
    active: Boolean(hook.active),
    githubHookUrl: hook.url,
    testUrl: hook.test_url,
    metadata: {
      name: hook.name,
      type: hook.type,
      createdBy: "devops-dashboard",
      jenkinsUrl: jenkins.status?.url,
      githubApiUrl: hook.url,
      subscribedEvents: WEBHOOK_EVENTS,
      createdViaDevOpsDashboard: true,
    },
    lastDelivery,
    recentDeliveries: deliveries,
    deliveryValidatedAt: new Date(),
    deliveryValidationStatus,
    createdInGitHubAt: hook.created_at ? new Date(hook.created_at) : new Date(),
  };

  const config = isDbConnected()
    ? await GitHubWebhookConfig.findOneAndUpdate(
        { userId, "repository.fullName": repository.fullName, webhookUrl },
        configData,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
    : localDB.createGitHubWebhookConfig(configData);

  console.log("[GitHub Webhook] Webhook saved to database successfully", {
    repository: repository.fullName,
    hookId: hook.id,
    configId: config._id || config.hookId,
    deliveryValidationStatus,
  });

  // ============================================================================
  // STEP 7: UPDATE PIPELINE AND DEPLOYMENT RECORDS
  // ============================================================================
  await updatePipelineWebhookStage(userId, config);
  const deployment = await markDeploymentWebhookConfigured(userId, config);

  console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW) ==========");

  return {
    success: true,
    message: "GitHub Webhook Connected (created new)",
    webhook: toPublicConfig(config, deliveries, await fetchLocalEvents(repository)),
    deploymentId: deployment?.deploymentId || null,
  };
}

export async function getGitHubWebhookStatus(userId, query = {}) {
  const accessToken = await getGitHubAccessToken(userId);
  const writeToken = query.testDelivery ? getGitHubWriteToken() : null;
  const readClient = createGitHubClient(accessToken);
  const writeClient = query.testDelivery ? createGitHubClient(writeToken) : null;
  const configs = await listConfigs(userId, {
    owner: query.owner,
    repo: query.repo,
  });

  const webhooks = await Promise.all(configs.map(async (config) => {
    let currentConfig = config;
    if (query.testDelivery && config.status === "active") {
      try {
        await pingWebhook(writeClient, {
          owner: config.repository.owner,
          repo: config.repository.name,
          hookId: config.hookId,
          accessToken: writeToken,
          repository: config.repository,
          clientLabel: "Server GITHUB_TOKEN status test delivery",
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn("[GitHub Webhook] Test delivery ping failed:", error.response?.data?.message || error.message);
      }
    }

    const deliveries = config.status === "active"
      ? await fetchDeliveries(readClient, {
          owner: config.repository.owner,
          repo: config.repository.name,
          hookId: config.hookId,
          accessToken,
          repository: config.repository,
          clientLabel: "User OAuth token status",
        })
      : [];
    if (query.testDelivery && deliveries[0]) {
      currentConfig = await updateStoredDelivery(userId, config, deliveries[0], deliveries);
    } else if (deliveries.length && config.status === "active") {
      currentConfig = await updateStoredDelivery(userId, config, deliveries[0], deliveries);
    }

    const localEvents = await fetchLocalEvents(config.repository);

    return toPublicConfig(currentConfig, deliveries, localEvents);
  }));

  return {
    success: true,
    connected: webhooks.some((webhook) => webhook.status === "active"),
    webhooks,
  };
}

export async function deleteGitHubWebhook(userId, payload = {}) {
  const repository = payload.owner && payload.repo ? normalizeRepository(payload) : {};
  const config = await findConfig(userId, {
    owner: repository.owner,
    repo: repository.name,
    hookId: payload.hookId,
  });

  if (!config) throw new Error("GitHub webhook configuration not found");

  const writeToken = getGitHubWriteToken();
  const client = createGitHubClient(writeToken);
  const endpoint = `/repos/${config.repository.owner}/${config.repository.name}/hooks/${config.hookId}`;
  await debugGitHubApiCall({
    client,
    accessToken: writeToken,
    repository: config.repository,
    method: "DELETE",
    endpoint,
    label: "Server GITHUB_TOKEN DELETE /repos/{owner}/{repo}/hooks/{hookId}",
  }).catch((error) => {
    if (error.response?.status !== 404) throw error;
  });

  const updates = {
    status: "deleted",
    active: false,
    deletedFromGitHubAt: new Date(),
    updatedAt: new Date(),
  };

  const updated = isDbConnected()
    ? await GitHubWebhookConfig.findOneAndUpdate({ userId, hookId: config.hookId }, updates, { new: true })
    : localDB.updateGitHubWebhookConfig(userId, config._id || config.hookId, updates);

  return {
    success: true,
    message: "GitHub webhook deleted",
    webhook: toPublicConfig(updated),
  };
}
