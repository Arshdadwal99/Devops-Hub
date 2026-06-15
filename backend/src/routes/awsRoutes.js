/**
 * AWS Infrastructure Routes
 * RESTful API endpoints for AWS infrastructure management
 */

import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import * as awsController from "./awsController.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// AWS Connection Management
router.post("/connect", awsController.connectAWS);
router.get("/connections", awsController.getAWSConnections);
router.get("/connections/:connectionId", awsController.getAWSConnection);
router.delete("/connections/:connectionId", awsController.disconnectAWS);

// Infrastructure Management
router.post("/infrastructure/create", awsController.createInfrastructure);
router.get("/infrastructure/provisioning-status/:jobId", awsController.getProvisioningStatus);
router.get("/jobs/:jobId/debug", awsController.getProvisioningDebug);
router.get("/instances", awsController.listAWSInstances);
router.get("/instances/:id", awsController.getAWSInstance);
router.post("/instances/:id/start", awsController.startAWSInstance);
router.post("/instances/:id/stop", awsController.stopAWSInstance);
router.post("/instances/:id/restart", awsController.restartAWSInstance);
router.delete("/instances/:id", awsController.terminateAWSInstance);
router.get("/infrastructure", awsController.getInfrastructure);
router.get("/infrastructure/:infrastructureId", awsController.getInfrastructureDetails);
router.get("/infrastructure/:infrastructureId/dashboard", awsController.getInfrastructureDashboard);
router.post("/infrastructure/:infrastructureId/terminate", awsController.terminateInfrastructure);
router.patch("/infrastructure/:infrastructureId/status", awsController.updateInfrastructureStatus);

// Configuration and Data
router.get("/instance-types", awsController.getInstanceTypes);

export default router;
