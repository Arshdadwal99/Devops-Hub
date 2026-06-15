import express from "express";
import {
  handleGitHubWebhook,
  getWebhooks,
  getWebhook,
  getWebhooksByRepo,
  getStats,
  removeWebhook,
  webhookHealth,
} from "../controllers/webhookController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public webhook endpoint (GitHub sends webhooks without auth)
router.post("/github", handleGitHubWebhook);
router.get("/github", (_req, res) => {
  res.status(405).json({
    message: "Method Not Allowed",
  });
});

// Health check (public)
router.get("/health", webhookHealth);

// Protected endpoints (require authentication)

// Get webhook history
router.get("/history", verifyToken, getWebhooks);

// Get webhook statistics
router.get("/stats", verifyToken, getStats);

// Get webhooks by repository
router.get("/repo/:repoName", verifyToken, getWebhooksByRepo);

// Get specific webhook
router.get("/:webhookId", verifyToken, getWebhook);

// Delete webhook
router.delete("/:webhookId", verifyToken, removeWebhook);

export default router;
