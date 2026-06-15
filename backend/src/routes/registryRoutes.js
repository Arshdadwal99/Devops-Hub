import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  connectDockerHubHandler,
  disconnectDockerHubHandler,
  getDockerHubStatusHandler,
} from "../controllers/registryController.js";

const router = express.Router();

router.use(verifyToken);

router.post("/dockerhub/connect", connectDockerHubHandler);
router.get("/dockerhub/status", getDockerHubStatusHandler);
router.post("/dockerhub/disconnect", disconnectDockerHubHandler);

export default router;
