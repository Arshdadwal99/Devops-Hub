import axios from "axios";
import { User } from "../models/User.js";
import { Pipeline } from "../models/Pipeline.js";
import { isDbConnected, localDB } from "../db.js";
import { encryptSecret, decryptSecret } from "./credentialEncryptionService.js";

const DOCKER_HUB_API = "https://hub.docker.com/v2";
const DOCKER_REGISTRY_AUTH_API = "https://auth.docker.io/token";

function getSafeDockerHubStatus(user) {
  const dockerHub = user?.dockerHub || {};

  return {
    connected: Boolean(dockerHub.connected),
    username: dockerHub.username || null,
    connectedAt: dockerHub.connectedAt || null,
    lastValidatedAt: dockerHub.lastValidatedAt || null,
    permissions: {
      login: Boolean(dockerHub.permissions?.login),
      push: Boolean(dockerHub.permissions?.push),
    },
  };
}

function validateInput(username, accessToken) {
  if (!username || typeof username !== "string" || !username.trim()) {
    throw new Error("Docker Hub username is required");
  }

  if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("Docker Hub access token is required");
  }

  return {
    username: username.trim(),
    accessToken: accessToken.trim(),
  };
}

export async function validateDockerHubCredentials(username, accessToken) {
  const credentials = validateInput(username, accessToken);

  const loginResponse = await axios.post(
    `${DOCKER_HUB_API}/users/login/`,
    {
      username: credentials.username,
      password: credentials.accessToken,
    },
    { timeout: 15000 }
  );

  const dockerHubJwt = loginResponse.data?.token;
  if (!dockerHubJwt) {
    throw new Error("Docker Hub did not return an auth token");
  }

  let pushPermission = false;
  try {
    const basicAuth = Buffer
      .from(`${credentials.username}:${credentials.accessToken}`)
      .toString("base64");

    const permissionResponse = await axios.get(DOCKER_REGISTRY_AUTH_API, {
      params: {
        service: "registry.docker.io",
        scope: `repository:${credentials.username}/devops-hub-permission-check:pull,push`,
      },
      headers: { Authorization: `Basic ${basicAuth}` },
      timeout: 15000,
    });

    pushPermission = Boolean(permissionResponse.data?.token || permissionResponse.data?.access_token);
    if (!pushPermission) {
      throw new Error("Docker Hub token did not grant repository push permissions");
    }
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      throw new Error("Docker Hub token does not have repository push permissions");
    }
    throw new Error(error.response?.data?.detail || "Could not verify Docker Hub push permissions");
  }

  return {
    login: true,
    push: pushPermission,
    dockerHubJwt,
  };
}

async function findUserWithDockerHub(userId) {
  if (isDbConnected()) {
    return User.findById(userId).select("+dockerHub.encryptedAccessToken +dockerHub.tokenIv +dockerHub.tokenAuthTag");
  }

  return localDB.findUserById(userId);
}

async function markDockerHubStageComplete(userId, username) {
  if (!isDbConnected()) return;

  await Pipeline.updateMany(
    { userId, provider: "github-actions", "stages.name": "Connect Docker Hub" },
    {
      $set: {
        "stages.$[stage].status": "success",
        "stages.$[stage].logs": [`Docker Hub connected as ${username}`],
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ "stage.name": "Connect Docker Hub" }] }
  ).catch((error) => {
    console.warn("[Docker Hub] Failed to update pipeline stage:", error.message);
  });
}

export async function connectDockerHub(userId, { username, accessToken }) {
  const credentials = validateInput(username, accessToken);
  const validation = await validateDockerHubCredentials(credentials.username, credentials.accessToken);
  const encrypted = encryptSecret(credentials.accessToken);
  const now = new Date();

  const dockerHub = {
    connected: true,
    username: credentials.username,
    encryptedAccessToken: encrypted.encryptedValue,
    tokenIv: encrypted.iv,
    tokenAuthTag: encrypted.authTag,
    connectedAt: now,
    lastValidatedAt: now,
    permissions: {
      login: validation.login,
      push: validation.push,
    },
  };

  let user;
  if (isDbConnected()) {
    user = await User.findByIdAndUpdate(
      userId,
      { dockerHub },
      { new: true }
    ).lean();
  } else {
    user = localDB.updateUserById(userId, { dockerHub });
  }

  if (!user) {
    throw new Error("User not found");
  }

  await markDockerHubStageComplete(userId, credentials.username);

  return {
    success: true,
    message: "Docker Hub Connected",
    status: getSafeDockerHubStatus(user),
  };
}

export async function getDockerHubStatus(userId) {
  const user = await findUserWithDockerHub(userId);
  if (!user) {
    throw new Error("User not found");
  }

  return {
    success: true,
    status: getSafeDockerHubStatus(user),
  };
}

export async function disconnectDockerHub(userId) {
  let user;

  const dockerHub = {
    connected: false,
    username: null,
    encryptedAccessToken: null,
    tokenIv: null,
    tokenAuthTag: null,
    connectedAt: null,
    lastValidatedAt: null,
    permissions: {
      login: false,
      push: false,
    },
  };

  if (isDbConnected()) {
    user = await User.findByIdAndUpdate(userId, { dockerHub }, { new: true }).lean();
  } else {
    user = localDB.updateUserById(userId, { dockerHub });
  }

  if (!user) {
    throw new Error("User not found");
  }

  return {
    success: true,
    message: "Docker Hub disconnected",
    status: getSafeDockerHubStatus(user),
  };
}

export async function getDockerHubAccessToken(userId) {
  const user = await findUserWithDockerHub(userId);
  const dockerHub = user?.dockerHub || {};

  if (!dockerHub.connected) {
    throw new Error("Docker Hub is not connected");
  }

  return {
    username: dockerHub.username,
    accessToken: decryptSecret({
      encryptedValue: dockerHub.encryptedAccessToken,
      iv: dockerHub.tokenIv,
      authTag: dockerHub.tokenAuthTag,
    }),
  };
}
