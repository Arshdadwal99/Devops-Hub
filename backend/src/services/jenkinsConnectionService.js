import axios from "axios";
import { User } from "../models/User.js";
import { isDbConnected, localDB } from "../db.js";
import { encryptSecret, decryptSecret } from "./credentialEncryptionService.js";

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

function normalizeToken(apiToken) {
  return String(apiToken || "").trim();
}

function validateInput({ url, username, apiToken }, requireToken = true) {
  const cleanUrl = normalizeUrl(url);
  const cleanUsername = normalizeUsername(username);
  const cleanToken = normalizeToken(apiToken);

  if (!cleanUrl) throw new Error("Jenkins URL is required");
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("Jenkins URL must start with http:// or https://");
  if (!cleanUsername) throw new Error("Jenkins username is required");
  if (requireToken && !cleanToken) throw new Error("Jenkins API token is required");

  return {
    url: cleanUrl,
    username: cleanUsername,
    apiToken: cleanToken,
  };
}

function createClient({ url, username, apiToken }) {
  return axios.create({
    baseURL: url,
    timeout: 8000,
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString("base64")}`,
      "User-Agent": "DevOps-Hub",
    },
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSafeJenkinsStatus(user) {
  const jenkins = user?.jenkins || {};

  return {
    connected: Boolean(jenkins.connected),
    url: jenkins.url || null,
    username: jenkins.username || null,
    connectedUser: jenkins.connectedUser || null,
    version: jenkins.version || null,
    connectedAt: jenkins.connectedAt || null,
    lastValidatedAt: jenkins.lastValidatedAt || null,
    permissions: {
      reachable: Boolean(jenkins.permissions?.reachable),
      authenticated: Boolean(jenkins.permissions?.authenticated),
      read: Boolean(jenkins.permissions?.read),
      jobRead: Boolean(jenkins.permissions?.jobRead),
      nodeRead: Boolean(jenkins.permissions?.nodeRead),
    },
    jobs: safeArray(jenkins.jobs),
    nodes: safeArray(jenkins.nodes),
    validationErrors: safeArray(jenkins.validationErrors),
  };
}

async function optionalRequest(label, errors, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    errors.push(`${label}: ${formatJenkinsConnectionError(error)}`);
    return { ok: false, data: null };
  }
}

export function formatJenkinsConnectionError(error) {
  if (error.response?.status === 401) return "authentication failed";
  if (error.response?.status === 403) return "permission denied";
  if (error.response?.status === 404) return "endpoint not found";
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
    return "Jenkins is unreachable";
  }
  return error.message || "Jenkins request failed";
}

export async function validateJenkinsConnection({ url, username, apiToken }) {
  const credentials = validateInput({ url, username, apiToken });
  const client = createClient(credentials);
  const errors = [];

  const root = await optionalRequest("Jenkins reachable", errors, async () => {
    const response = await client.get("/api/json", {
      params: {
        tree: "mode,nodeDescription,nodeName,primaryView[name],jobs[name,url,color]",
      },
    });
    return response;
  });

  if (!root.ok) {
    return {
      success: false,
      url: credentials.url,
      username: credentials.username,
      version: "Unknown",
      connectedUser: null,
      permissions: {
        reachable: false,
        authenticated: false,
        read: false,
        jobRead: false,
        nodeRead: false,
      },
      jobs: [],
      nodes: [],
      validationErrors: errors,
    };
  }

  const me = await optionalRequest("Authentication", errors, async () => {
    const response = await client.get("/me/api/json", {
      params: { tree: "id,fullName,absoluteUrl" },
    });
    return response;
  });

  const jobs = root.ok
    ? safeArray(root.data.data?.jobs).map((job) => ({
        name: job.name,
        url: job.url,
        color: job.color,
      }))
    : [];

  const nodes = await optionalRequest("Node permissions", errors, async () => {
    const response = await client.get("/computer/api/json", {
      params: {
        tree: "computer[displayName,offline,numExecutors]",
      },
    });
    return response;
  });

  const mappedNodes = nodes.ok
    ? safeArray(nodes.data.data?.computer).map((node) => ({
        name: node.displayName === "Built-In Node" ? "built-in" : node.displayName,
        displayName: node.displayName,
        offline: Boolean(node.offline),
        executors: Number(node.numExecutors || 0),
      }))
    : [];

  const permissions = {
    reachable: root.ok,
    authenticated: me.ok,
    read: root.ok,
    jobRead: root.ok,
    nodeRead: nodes.ok,
  };

  const success = Object.values(permissions).every(Boolean);

  return {
    success,
    url: credentials.url,
    username: credentials.username,
    version: root.data?.headers?.["x-jenkins"] || root.data?.headers?.["x-hudson"] || "Unknown",
    connectedUser: me.data?.data?.fullName || me.data?.data?.id || credentials.username,
    permissions,
    jobs,
    nodes: mappedNodes,
    validationErrors: errors,
  };
}

async function findUserWithJenkins(userId) {
  if (isDbConnected()) {
    return User.findById(userId).select("+jenkins.encryptedApiToken +jenkins.tokenIv +jenkins.tokenAuthTag");
  }

  return localDB.findUserById(userId);
}

export async function connectJenkins(userId, { url, username, apiToken }) {
  const credentials = validateInput({ url, username, apiToken });
  const test = await validateJenkinsConnection(credentials);

  if (!test.success) {
    return {
      success: false,
      message: "Jenkins validation failed",
      test,
    };
  }

  const encrypted = encryptSecret(credentials.apiToken);
  const now = new Date();
  const jenkins = {
    connected: true,
    url: credentials.url,
    username: credentials.username,
    encryptedApiToken: encrypted.encryptedValue,
    tokenIv: encrypted.iv,
    tokenAuthTag: encrypted.authTag,
    connectedAt: now,
    lastValidatedAt: now,
    version: test.version,
    connectedUser: test.connectedUser,
    permissions: test.permissions,
    jobs: test.jobs,
    nodes: test.nodes,
    validationErrors: [],
  };

  let user;
  if (isDbConnected()) {
    user = await User.findByIdAndUpdate(userId, { jenkins }, { new: true }).lean();
  } else {
    user = localDB.updateUserById(userId, { jenkins });
  }

  if (!user) throw new Error("User not found");

  return {
    success: true,
    message: "Jenkins Connected",
    status: getSafeJenkinsStatus(user),
    test,
  };
}

export async function getJenkinsStatus(userId) {
  const user = await findUserWithJenkins(userId);
  if (!user) throw new Error("User not found");

  return {
    success: true,
    status: getSafeJenkinsStatus(user),
  };
}

export async function disconnectJenkins(userId) {
  const jenkins = {
    connected: false,
    url: null,
    username: null,
    encryptedApiToken: null,
    tokenIv: null,
    tokenAuthTag: null,
    connectedAt: null,
    lastValidatedAt: null,
    version: null,
    connectedUser: null,
    permissions: {
      reachable: false,
      authenticated: false,
      read: false,
      jobRead: false,
      nodeRead: false,
    },
    jobs: [],
    nodes: [],
    validationErrors: [],
  };

  let user;
  if (isDbConnected()) {
    user = await User.findByIdAndUpdate(userId, { jenkins }, { new: true }).lean();
  } else {
    user = localDB.updateUserById(userId, { jenkins });
  }

  if (!user) throw new Error("User not found");

  return {
    success: true,
    message: "Jenkins disconnected",
    status: getSafeJenkinsStatus(user),
  };
}

export async function testSavedJenkinsConnection(userId) {
  const user = await findUserWithJenkins(userId);
  const jenkins = user?.jenkins || {};

  if (!user) throw new Error("User not found");
  if (!jenkins.connected) throw new Error("Jenkins is not connected");

  const apiToken = decryptSecret({
    encryptedValue: jenkins.encryptedApiToken,
    iv: jenkins.tokenIv,
    authTag: jenkins.tokenAuthTag,
  });

  const test = await validateJenkinsConnection({
    url: jenkins.url,
    username: jenkins.username,
    apiToken,
  });

  const updates = {
    "jenkins.connected": test.success,
    "jenkins.lastValidatedAt": new Date(),
    "jenkins.version": test.version,
    "jenkins.connectedUser": test.connectedUser,
    "jenkins.permissions": test.permissions,
    "jenkins.jobs": test.jobs,
    "jenkins.nodes": test.nodes,
    "jenkins.validationErrors": test.validationErrors,
  };

  let updatedUser;
  if (isDbConnected()) {
    updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).lean();
  } else {
    updatedUser = localDB.updateUserById(userId, updates);
  }

  return {
    success: test.success,
    message: test.success ? "Jenkins validation passed" : "Jenkins validation failed",
    status: getSafeJenkinsStatus(updatedUser),
    test,
  };
}

export function jenkinsValidationPassed(status) {
  const permissions = status?.permissions || {};
  return Boolean(
    status?.connected &&
      permissions.reachable &&
      permissions.authenticated &&
      permissions.read &&
      permissions.jobRead &&
      permissions.nodeRead
  );
}

export async function getJenkinsConnectionCredentials(userId) {
  const user = await findUserWithJenkins(userId);
  const jenkins = user?.jenkins || {};

  if (!jenkins.connected) throw new Error("Jenkins is not connected");

  return {
    url: jenkins.url,
    username: jenkins.username,
    apiToken: decryptSecret({
      encryptedValue: jenkins.encryptedApiToken,
      iv: jenkins.tokenIv,
      authTag: jenkins.tokenAuthTag,
    }),
  };
}
