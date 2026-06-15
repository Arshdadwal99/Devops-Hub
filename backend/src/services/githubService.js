import axios from "axios";
import { User } from "../models/User.js";
import { config } from "../config.js";

const GITHUB_OAUTH_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";
const GITHUB_API_BASE = "https://api.github.com";

// In-memory state storage for OAuth flow (state -> userId mapping)
// In production, use Redis or database
const githubStateStore = new Map();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate and store OAuth state for user
 */
export function generateOAuthState(userId) {
  const state = `${Date.now()}_${Math.random().toString(36).substring(7)}_${userId}`;
  
  // Store state with expiry
  githubStateStore.set(state, {
    userId,
    createdAt: Date.now(),
  });

  // Clean up old states
  for (const [key, value] of githubStateStore.entries()) {
    if (Date.now() - value.createdAt > STATE_EXPIRY_MS) {
      githubStateStore.delete(key);
    }
  }

  return state;
}

/**
 * Validate and retrieve user ID from OAuth state
 */
export function validateOAuthState(state) {
  const stateData = githubStateStore.get(state);
  
  if (!stateData) {
    throw new Error("Invalid or expired state parameter");
  }

  if (Date.now() - stateData.createdAt > STATE_EXPIRY_MS) {
    githubStateStore.delete(state);
    throw new Error("State parameter expired");
  }

  // Remove state after validation (one-time use)
  githubStateStore.delete(state);
  
  return stateData.userId;
}

/**
 * Generate GitHub OAuth authorization URL
 */
export function generateGitHubAuthUrl(userId) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  
  if (!clientId) {
    throw new Error("GITHUB_CLIENT_ID environment variable not set");
  }

  if (!userId) {
    throw new Error("User ID is required to initiate GitHub OAuth");
  }

  const redirectUri = `${process.env.BACKEND_URL || "http://localhost:5000"}/api/github/callback`;
  const scope = "repo,workflow,admin:repo_hook,user:email,read:user";
  const state = generateOAuthState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope,
    state: state,
    allow_signup: "true",
  });

  return `${GITHUB_OAUTH_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code) {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("GitHub OAuth credentials not configured");
    }

    const response = await axios.post(
      GITHUB_OAUTH_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (response.data.error) {
      throw new Error(`GitHub OAuth error: ${response.data.error_description}`);
    }

    console.log("✅ [GitHub] Access token obtained successfully");
    return response.data.access_token;
  } catch (error) {
    console.error("❌ [GitHub] Token exchange failed:", error.message);
    throw new Error(`Failed to exchange code for token: ${error.message}`);
  }
}

/**
 * Fetch GitHub user info using access token
 */
export async function fetchGitHubUserInfo(accessToken) {
  try {
    const response = await axios.get(GITHUB_API_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    console.log("✅ [GitHub] User info fetched successfully");
    return response.data;
  } catch (error) {
    console.error("❌ [GitHub] Failed to fetch user info:", error.message);
    throw new Error(`Failed to fetch GitHub user info: ${error.message}`);
  }
}

/**
 * Connect GitHub account to user
 */
export async function connectGitHubAccount(userId, accessToken, githubUserInfo) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error("User not found");
    }

    // Store GitHub connection info
    user.githubConnected = true;
    user.githubUsername = githubUserInfo.login;
    user.githubAvatar = githubUserInfo.avatar_url;
    user.githubAccessToken = accessToken;
    user.githubConnectedAt = new Date();

    await user.save();

    console.log(`✅ [GitHub] Account connected for user: ${user.email}`);
    
    return {
      success: true,
      message: "GitHub account connected successfully",
      user: {
        id: user._id,
        githubConnected: user.githubConnected,
        githubUsername: user.githubUsername,
        githubAvatar: user.githubAvatar,
        githubConnectedAt: user.githubConnectedAt,
      },
    };
  } catch (error) {
    console.error("❌ [GitHub] Connection failed:", error.message);
    throw error;
  }
}

/**
 * Get GitHub connection status for user
 */
export async function getGitHubStatus(userId) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error("User not found");
    }

    return {
      success: true,
      githubConnected: user.githubConnected,
      githubUsername: user.githubUsername,
      githubAvatar: user.githubAvatar,
      githubConnectedAt: user.githubConnectedAt,
    };
  } catch (error) {
    console.error("❌ [GitHub] Status check failed:", error.message);
    throw error;
  }
}

/**
 * Disconnect GitHub account from user
 */
export async function disconnectGitHubAccount(userId) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error("User not found");
    }

    // Clear GitHub connection info
    user.githubConnected = false;
    user.githubUsername = null;
    user.githubAvatar = null;
    user.githubAccessToken = null;
    user.githubConnectedAt = null;

    await user.save();

    console.log(`✅ [GitHub] Account disconnected for user: ${user.email}`);
    
    return {
      success: true,
      message: "GitHub account disconnected successfully",
      user: {
        id: user._id,
        githubConnected: user.githubConnected,
      },
    };
  } catch (error) {
    console.error("❌ [GitHub] Disconnection failed:", error.message);
    throw error;
  }
}

/**
 * Get GitHub access token for user
 */
export async function getGitHubAccessToken(userId) {
  try {
    const user = await User.findById(userId).select("+githubAccessToken");
    
    if (!user || !user.githubAccessToken) {
      throw new Error("GitHub not connected");
    }

    return user.githubAccessToken;
  } catch (error) {
    console.error("❌ [GitHub] Token retrieval failed:", error.message);
    throw error;
  }
}

/**
 * Get GitHub token for repository WRITE operations.
 * This must be the server PAT, not the user's OAuth login token.
 */
export function getGitHubWriteToken() {
  const token = process.env.GITHUB_TOKEN;
  const tokenSource = "process.env.GITHUB_TOKEN";

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN environment variable missing");
  }

  console.log("=== TOKEN DEBUG ===");
  console.log({
    source: tokenSource,
    prefix: token?.substring(0, 10),
    length: token?.length,
  });

  return token;
}

export function createGitHubWriteClient() {
  const token = getGitHubWriteToken();

  return axios.create({
    baseURL: GITHUB_API_BASE,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

/**
 * Fetch user's GitHub repositories
 */
export async function getGitHubRepositories(userId) {
  try {
    const accessToken = await getGitHubAccessToken(userId);

    console.log("📚 [GitHub] Fetching repositories for user:", userId);

    const response = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      params: {
        sort: "updated",
        direction: "desc",
        per_page: 100,
      },
    });

    console.log(`✅ [GitHub] Found ${response.data.length} repositories`);

    // Format repository data
    const repositories = response.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      description: repo.description || "No description",
      language: repo.language || "Unknown",
      visibility: repo.private ? "private" : "public",
      defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url,
      htmlUrl: repo.html_url,
      updatedAt: repo.updated_at,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
    }));

    return {
      success: true,
      repositories: repositories,
      count: repositories.length,
    };
  } catch (error) {
    console.error("❌ [GitHub] Repository fetch failed:", error.message);
    throw new Error(`Failed to fetch repositories: ${error.message}`);
  }
}

