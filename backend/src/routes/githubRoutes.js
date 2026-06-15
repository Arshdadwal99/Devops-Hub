import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import * as githubService from "../services/githubService.js";
import {
  createGitHubWebhook,
  deleteGitHubWebhook,
  getGitHubWebhookStatus,
} from "../services/githubWebhookConfigService.js";

const router = express.Router();

/**
 * GET /api/github/connect
 * Get GitHub OAuth authorization URL
 * Requires: Authentication token in header
 */
router.get("/connect", verifyToken, (req, res, next) => {
  try {
    console.log("🔐 [GitHub] Connect request from user:", req.user.userId);
    
    const authUrl = githubService.generateGitHubAuthUrl(req.user.userId);
    
    res.json({
      success: true,
      authUrl: authUrl,
      message: "Redirect user to this URL to authenticate with GitHub",
    });
  } catch (error) {
    console.error("❌ [GitHub] Connect error:", error.message);
    next(error);
  }
});

/**
 * GET /api/github/callback
 * GitHub OAuth callback - exchange code for token and connect account
 * NO AUTHENTICATION REQUIRED - uses OAuth state parameter for security
 */
router.get("/callback", async (req, res, next) => {
  try {
    const { code, state } = req.query;
    
    console.log("✅ [GitHub] Callback received");
    
    // Validate required parameters
    if (!code) {
      console.warn("⚠️  [GitHub] Callback: No authorization code provided");
      return res.redirect(
        `http://localhost:5173?error=No authorization code provided`
      );
    }

    if (!state) {
      console.warn("⚠️  [GitHub] Callback: No state parameter provided");
      return res.redirect(
        `http://localhost:5173?error=Invalid state parameter`
      );
    }

    // Validate state and get user ID
    let userId;
    try {
      userId = githubService.validateOAuthState(state);
      console.log("✅ [GitHub] State validated, user ID:", userId);
    } catch (stateError) {
      console.warn("⚠️  [GitHub] State validation failed:", stateError.message);
      return res.redirect(
        `http://localhost:5173?error=${encodeURIComponent(stateError.message)}`
      );
    }

    // Exchange code for access token
    console.log("🔄 [GitHub] Token exchange started");
    const accessToken = await githubService.exchangeCodeForToken(code);
    console.log("✅ [GitHub] Token exchange successful");

    // Fetch GitHub user info
    console.log("📝 [GitHub] Fetching user information");
    const githubUserInfo = await githubService.fetchGitHubUserInfo(accessToken);

    // Connect GitHub account to user
    console.log("🔗 [GitHub] User connected:", userId);
    const result = await githubService.connectGitHubAccount(
      userId,
      accessToken,
      githubUserInfo
    );

    console.log("✅ [GitHub] Account successfully connected");
    
    // Redirect to frontend with success
    res.redirect(
      `http://localhost:5173/integrations?github_connected=true&username=${encodeURIComponent(githubUserInfo.login)}`
    );
  } catch (error) {
    console.error("❌ [GitHub] Callback error:", error.message);
    res.redirect(
      `http://localhost:5173?error=${encodeURIComponent(error.message)}`
    );
  }
});

/**
 * GET /api/github/status
 * Get GitHub connection status for current user
 */
router.get("/status", verifyToken, async (req, res, next) => {
  try {
    console.log("📊 [GitHub] Status check for user:", req.user.userId);

    const status = await githubService.getGitHubStatus(req.user.userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("❌ [GitHub] Status check error:", error.message);
    next(error);
  }
});

/**
 * GET /api/github/repos
 * Fetch user's GitHub repositories
 * Requires: Authentication token in header
 */
router.get("/repos", verifyToken, async (req, res, next) => {
  try {
    console.log("📚 [GitHub] Repos request from user:", req.user.userId);

    const result = await githubService.getGitHubRepositories(req.user.userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ [GitHub] Repos fetch error:", error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/webhook/create", verifyToken, async (req, res) => {
  try {
    const result = await createGitHubWebhook(req.user.userId, {
      owner: req.body?.owner,
      repo: req.body?.repo,
      branch: req.body?.branch,
      webhookUrl: req.body?.webhookUrl,
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    console.error("[GitHub Webhook] Create error:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

router.get("/webhook/status", verifyToken, async (req, res) => {
  try {
    const result = await getGitHubWebhookStatus(req.user.userId, {
      owner: req.query?.owner,
      repo: req.query?.repo,
      testDelivery: req.query?.testDelivery === "true",
    });

    res.json(result);
  } catch (error) {
    console.error("[GitHub Webhook] Status error:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

router.delete("/webhook", verifyToken, async (req, res) => {
  try {
    const result = await deleteGitHubWebhook(req.user.userId, {
      owner: req.body?.owner || req.query?.owner,
      repo: req.body?.repo || req.query?.repo,
      hookId: req.body?.hookId || req.query?.hookId,
    });

    res.json(result);
  } catch (error) {
    console.error("[GitHub Webhook] Delete error:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

/**
 * POST /api/github/disconnect
 * Disconnect GitHub account from current user
 */
router.post("/disconnect", verifyToken, async (req, res, next) => {
  try {
    console.log("❌ [GitHub] Disconnect request from user:", req.user.userId);

    const result = await githubService.disconnectGitHubAccount(req.user.userId);

    console.log("✅ [GitHub] Account disconnected");

    res.json({
      success: true,
      message: "GitHub account disconnected successfully",
      data: result.user,
    });
  } catch (error) {
    console.error("❌ [GitHub] Disconnect error:", error.message);
    next(error);
  }
});

export default router;
