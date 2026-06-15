import {
  verifyGitHubSignature,
  extractGitHubPushData,
  extractGitHubPullRequestData,
  extractGitHubReleaseData,
} from "../utils/webhookVerifier.js";
import {
  processWebhookEvent,
  getWebhookHistory,
  getWebhookById,
  getWebhooksByRepository,
  getWebhookStats,
  deleteWebhook,
} from "../services/webhookService.js";

/**
 * Handle GitHub webhook
 * POST /api/webhooks/github
 */
export const handleGitHubWebhook = async (req, res, next) => {
  try {
    console.log("GitHub webhook received");

    // Get signature and event type from headers
    const signature = req.headers["x-hub-signature-256"];
    const eventType = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"];

    console.log("Event:", eventType);
    console.log("Delivery:", deliveryId);

    // GitHub signs the exact raw request body bytes.
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    // Verify GitHub signature
    if (!verifyGitHubSignature(rawBody, signature)) {
      return res.status(401).json({
        message: "Invalid GitHub webhook signature",
      });
    }

    console.log(`GitHub signature verified. Event: ${eventType}, Delivery: ${deliveryId}`);

    // Process based on event type
    let webhookData;

    switch (eventType) {
      case "push":
        webhookData = extractGitHubPushData(req.body);
        break;
      case "pull_request":
        webhookData = extractGitHubPullRequestData(req.body);
        break;
      case "release":
        webhookData = extractGitHubReleaseData(req.body);
        break;
      default:
        console.log(`Skipping event type: ${eventType}`);
        return res.status(200).json({
          success: true,
          message: `Event type '${eventType}' is not processed`,
        });
    }

    // Process webhook event
    const result = await processWebhookEvent(eventType, webhookData, req.body);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error handling GitHub webhook:", error.message);
    next(error);
  }
};

/**
 * Get webhook history
 * GET /api/webhooks/history?limit=50&skip=0
 */
export const getWebhooks = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const result = await getWebhookHistory(limit, skip);

    res.json(result);
  } catch (error) {
    console.error("Error fetching webhooks:", error.message);
    next(error);
  }
};

/**
 * Get webhook by ID
 * GET /api/webhooks/:webhookId
 */
export const getWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;

    const webhook = await getWebhookById(webhookId);

    res.json(webhook);
  } catch (error) {
    console.error("Error fetching webhook:", error.message);
    next(error);
  }
};

/**
 * Get webhooks by repository
 * GET /api/webhooks/repo/:repoName
 */
export const getWebhooksByRepo = async (req, res, next) => {
  try {
    const { repoName } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    const result = await getWebhooksByRepository(repoName, limit, skip);

    res.json(result);
  } catch (error) {
    console.error("Error fetching repository webhooks:", error.message);
    next(error);
  }
};

/**
 * Get webhook statistics
 * GET /api/webhooks/stats
 */
export const getStats = async (req, res, next) => {
  try {
    const stats = await getWebhookStats();

    res.json(stats);
  } catch (error) {
    console.error("Error fetching webhook stats:", error.message);
    next(error);
  }
};

/**
 * Delete webhook
 * DELETE /api/webhooks/:webhookId
 */
export const removeWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;

    const result = await deleteWebhook(webhookId);

    res.json({
      success: true,
      message: "Webhook deleted successfully",
      webhook: result,
    });
  } catch (error) {
    console.error("Error deleting webhook:", error.message);
    next(error);
  }
};

/**
 * Health check for webhook
 * GET /api/webhooks/health
 */
export const webhookHealth = async (_req, res) => {
  res.json({
    status: "ok",
    message: "Webhook service is running",
    timestamp: new Date(),
  });
};
