import express from "express";
import analyzeRoutes from "./analyzeRoutes.js";
import deploymentRoutes from "./deploymentRoutes.js";
import dockerRoutes from "./dockerRoutes.js";
import jenkinsRoutes from "./jenkinsRoutes.js";
import logRoutes from "./logRoutes.js";
import metricsRoutes from "./metricsRoutes.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

function forwardTo(targetRouter, targetPath) {
  return (req, res, next) => {
    const originalUrl = req.url;
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";

    req.url = `${targetPath}${query}`;
    targetRouter.handle(req, res, (error) => {
      req.url = originalUrl;
      next(error);
    });
  };
}

// Compatibility endpoints requested by the CI/CD automation contract.
router.get("/deployments", verifyToken, forwardTo(deploymentRoutes, "/"));
router.post("/deploy", verifyToken, forwardTo(deploymentRoutes, "/deploy"));
router.post("/rollback", verifyToken, forwardTo(deploymentRoutes, "/rollback"));
router.post("/restart", verifyToken, forwardTo(deploymentRoutes, "/restart"));
router.get("/containers", verifyToken, forwardTo(dockerRoutes, "/containers"));
router.get("/logs", verifyToken, forwardTo(logRoutes, "/"));
router.get("/metrics", verifyToken, forwardTo(metricsRoutes, "/"));
router.post("/analyze-logs", verifyToken, forwardTo(analyzeRoutes, "/analyze-logs"));
router.get("/pipeline", verifyToken, forwardTo(jenkinsRoutes, "/pipeline/status"));
router.get("/pipeline/status", verifyToken, forwardTo(jenkinsRoutes, "/pipeline/status"));

export default router;
