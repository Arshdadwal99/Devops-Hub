import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config.js";
import { connectDb, isDbConnected, closeDb } from "./db.js";
import { initializeDockerCheck } from "./services/dockerService.js";
import { initializeJenkinsCheck } from "./services/jenkinsService.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import metricsRoutes from "./routes/metricsRoutes.js";
import deploymentRoutes from "./routes/deploymentRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import analyzeRoutes from "./routes/analyzeRoutes.js";
import monitoringRoutes from "./routes/monitoringRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import jenkinsRoutes from "./routes/jenkinsRoutes.js";
import dockerRoutes from "./routes/dockerRoutes.js";
import logRoutes from "./routes/logRoutes.js";
import compatibilityRoutes from "./routes/compatibilityRoutes.js";
import automationRoutes from "./routes/automationRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import projectsRoutes from "./routes/projectsRoutes.js";
import githubRoutes from "./routes/githubRoutes.js";
import repositoriesRoutes from "./routes/repositoriesRoutes.js";
import cicdRoutes from "./routes/cicdRoutes.js";
import registryRoutes from "./routes/registryRoutes.js";
import awsRoutes from "./routes/awsRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";
import { verifyAuthToken, verifyToken } from "./middleware/authMiddleware.js";
import { handleGitHubWebhook } from "./controllers/webhookController.js";
import { getSystemMetrics, clearMetricsCache } from "./services/metricsService.js";
import { generateMetricAlerts } from "./services/alertService.js";
import { initializeSocketEvents } from "./services/socketEventsService.js";
import { validateEc2SshStartupConfig } from "./services/ec2SshKeyService.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: Array.isArray(config.clientOrigin) ? config.clientOrigin : config.clientOrigin.split(','),
    credentials: true,
  },
});

// Initialize Socket.io events service
initializeSocketEvents(io);
validateEc2SshStartupConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

// Log frontend paths at startup for debugging
console.log(`📁 Frontend dist path: ${frontendDistPath}`);
console.log(`📄 Frontend index path: ${frontendIndexPath}`);
console.log(`✓ Frontend static path exists: ${existsSync(frontendDistPath)}`);

// Middleware
app.use(
  cors({
    origin: Array.isArray(config.clientOrigin) ? config.clientOrigin : config.clientOrigin.split(','),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  })
);

app.use((req, res, next) => {
  res.on("finish", () => {
    const matchedRoute = req.route?.path
      ? `${req.baseUrl || ""}${req.route.path}`
      : "unmatched";

    console.log("[Route Trace]", {
      requestedUrl: `${req.method} ${req.originalUrl}`,
      matchedRoute,
      responseStatus: res.statusCode,
    });
  });

  next();
});

// Debug middleware
app.use((req, res, next) => {
  console.log(`📨 [${req.method}] ${req.path}`, { bodyKeys: req.body ? Object.keys(req.body) : 'no body' });
  next();
});

// Health check endpoint (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({ 
    ok: true, 
    message: "Server is running",
    dbConnected: isDbConnected(),
    timestamp: new Date().toISOString(),
  });
});

// Deployment API health check
app.get("/api/deployment/health", (_req, res) => {
  res.json({ 
    status: "ok",
    service: "deployment",
    ready: true,
    dbConnected: isDbConnected(),
    endpoints: {
      validate: "POST /api/deployment/one-click-validate",
      deploy: "POST /api/deployment/one-click-deploy",
      status: "GET /api/deployment/status/:id",
      progress: "GET /api/deployment/:deploymentId/progress",
    },
    timestamp: new Date().toISOString(),
  });
});

// API root endpoint
app.get("/api", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      dashboard: "/api/dashboard",
      metrics: "/api/metrics",
      deployments: "/api/deployments",
      users: "/api/users",
      projects: "/api/projects"
    }
  });
});

// Test endpoint
app.post("/api/test", (req, res) => {
  res.json({ ok: true, message: "Backend is responding", body: req.body });
});

// Public routes (no auth required)
app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.post("/api/webhook", handleGitHubWebhook);
app.post("/webhook", handleGitHubWebhook);

// Public deployment API health endpoints (no auth required)
app.get("/api/deployment/health", (_req, res) => {
  res.json({ 
    status: "ok",
    service: "deployment",
    ready: true,
    dbConnected: isDbConnected(),
    endpoints: {
      validate: "POST /api/deployment/one-click-validate (requires auth)",
      deploy: "POST /api/deployment/one-click-deploy (requires auth)",
      status: "GET /api/deployment/status/:id (requires auth)",
      progress: "GET /api/deployment/:deploymentId/progress (requires auth)",
      health: "GET /api/deployment/health (public)",
    },
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/deployment/test", (_req, res) => {
  res.json({
    success: true,
    message: "Deployment test endpoint is working",
    dbConnected: isDbConnected(),
    timestamp: new Date().toISOString(),
  });
});

// GitHub integration routes (requires auth)
app.use("/api/github", githubRoutes);

// Middleware to log database availability for monitoring (non-blocking)
app.use((req, res, next) => {
  // Only check for API routes that typically need the database
  const dbDependentPaths = [
    "/api/dashboard",
    "/api/metrics",
    "/api/deployment",
    "/api/deployments",
    "/api/alerts",
    "/api/monitoring",
    "/api/analyze",
    "/api/logs",
    "/api/automation",
    "/api/cicd",
    "/api/registry",
    "/api/ec2",
    "/api/workflow",
  ];

  const needsDb = dbDependentPaths.some(path => req.path.startsWith(path));

  // LOG but DON'T BLOCK - Allow request to proceed and let controller handle gracefully
  if (needsDb && !isDbConnected()) {
    console.warn(`⚠️  [DB] Unavailable for: ${req.method} ${req.path} - controller will handle gracefully`);
    // Attach flag to request for controllers to check if needed
    req.dbUnavailable = true;
  }

  next();
});

// Protected routes
app.use("/api/dashboard", verifyToken, dashboardRoutes);
app.use("/api/metrics", verifyToken, metricsRoutes);
console.log("✅ [Routes] Deployment routes mounting...");
// Note: Deployment routes include both public endpoints (/health, /test) and protected endpoints
// Auth middleware applies to the whole /api/deployment path
app.use("/api/deployment", verifyToken, deploymentRoutes);
console.log("✅ [Routes] Deployment routes registered on /api/deployment");
app.use("/api/deployments", verifyToken, deploymentRoutes);
console.log("✅ [Routes] Deployment routes also registered on /api/deployments (alias)");
app.use("/api/alerts", verifyToken, alertRoutes);
app.use("/api/monitoring", verifyToken, monitoringRoutes);
app.use("/api/analyze", verifyToken, analyzeRoutes);
app.use("/api/logs", verifyToken, logRoutes);
app.use("/api/automation", verifyToken, automationRoutes);
app.use("/api/users", verifyToken, usersRoutes);
app.use("/api/projects", verifyToken, projectsRoutes);
app.use("/api/repositories", verifyToken, repositoriesRoutes);
app.use("/api/cicd", verifyToken, cicdRoutes);
app.use("/api/registry", registryRoutes);
app.use("/api/aws", awsRoutes);
app.use("/api/jenkins", jenkinsRoutes);
app.use("/api/docker", dockerRoutes);
app.use("/api/workflow", verifyToken, workflowRoutes);

// Compatibility routes - MUST be registered AFTER all specific routes
// This catches any remaining /api endpoints that need forwarding
app.use("/api", compatibilityRoutes);

// Socket.io real-time updates
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }

  verifyAuthToken(token)
    .then(({ user, provider }) => {
      socket.user = user;
      socket.userProvider = provider;
      next();
    })
    .catch(() => next(new Error("Invalid authentication token")));
});

io.on("connection", (socket) => {
  console.log(`✅ Socket.io client connected: ${socket.id}`);

  // Subscribe to metrics updates
  socket.on("subscribe:metrics", () => {
    socket.join("metrics");
    console.log(`📊 Client subscribed to metrics`);
  });

  // Subscribe to alerts
  socket.on("subscribe:alerts", () => {
    socket.join("alerts");
    console.log(`🚨 Client subscribed to alerts`);
  });

  // Subscribe to pipeline updates
  socket.on("subscribe:pipeline", () => {
    socket.join("pipeline");
    console.log(`🔄 Client subscribed to pipeline`);
  });

  // Subscribe to Docker build logs for one prepared deployment
  socket.on("subscribe:build", (deploymentId) => {
    if (!deploymentId) return;
    socket.join(`build:${deploymentId}`);
    console.log(`🐳 Client subscribed to build logs: ${deploymentId}`);
  });

  // Subscribe to logs
  socket.on("subscribe:logs", () => {
    socket.join("logs");
    console.log(`📝 Client subscribed to logs`);
  });

  // Subscribe to Jenkins status updates
  socket.on("subscribe:jenkins-status", () => {
    socket.join("jenkins-status");
    console.log(`🔨 Client subscribed to Jenkins status`);
  });

  // Subscribe to Jenkins build updates
  socket.on("subscribe:jenkins-builds", () => {
    socket.join("jenkins-builds");
    console.log(`🔨 Client subscribed to Jenkins builds`);
  });

  // Subscribe to Docker container updates
  socket.on("subscribe:docker-monitor", () => {
    socket.join("docker-monitor");
    console.log(`🐳 Client subscribed to Docker monitor`);
  });

  // Subscribe to Docker stats updates
  socket.on("subscribe:docker-stats", () => {
    socket.join("docker-stats");
    console.log(`📊 Client subscribed to Docker stats`);
  });

  // Request container stats on demand
  socket.on("docker:request-container-stats", async (containerId) => {
    try {
      const { getContainerStats } = await import("./services/dockerService.js");
      const result = await getContainerStats(containerId);
      socket.emit("docker:container-stats-response", result);
    } catch (error) {
      console.error("Error fetching container stats:", error);
    }
  });

  // Listen for build progress requests and emit real-time updates
  socket.on("jenkins:request-build-progress", async (buildNumber) => {
    try {
      const { getJenkinsBuildStatus } = await import("./services/jenkinsService.js");
      const status = await getJenkinsBuildStatus(buildNumber);
      socket.emit("jenkins:build-progress", status);
    } catch (error) {
      console.error("Error fetching build progress:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Socket.io client disconnected: ${socket.id}`);
  });
});

// Export Socket.io instance for services to emit events
export { io };

if (existsSync(frontendIndexPath)) {
  // Serve static files from frontend/dist with caching headers
  app.use(express.static(frontendDistPath, {
    maxAge: '1d',
    etag: false,
  }));

  // SPA fallback - catch all routes not matching static files or API
  // This middleware runs after static files, so if a file exists it's already served
  app.use((req, res, next) => {
    // If it's an API or webhook request, skip to next middleware
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
      return next();
    }
    
    // For all other requests, serve index.html (SPA routing)
    res.sendFile(frontendIndexPath, (err) => {
      if (err) {
        console.error(`❌ Error serving frontend file ${frontendIndexPath}:`, err.message);
        
        // If sendFile failed, send 404 instead of error page
        if (!res.headersSent) {
          res.status(404).send("Frontend not available");
        }
      }
    });
  });
} else {
  console.warn(`⚠️  [Frontend] Frontend dist path not found: ${frontendDistPath}`);
  console.warn(`⚠️  [Frontend] Frontend static files will not be served`);
  
  // Provide basic response for root path even without frontend
  app.get("/", (req, res) => {
    res.json({
      message: "DevOps Hub Backend - Frontend not available",
      api: "/api/health",
      status: "ok"
    });
  });
}

// Error handling middleware
app.use((error, _req, res, _next) => {
  console.error(error);
  
  // Check for MongoDB connection errors
  if (error.message && error.message.includes("MongoDB")) {
    return res.status(503).json({
      message: "Database unavailable. Please ensure MongoDB is running.",
      error: error.message,
    });
  }
  
  // Check for Firebase authentication errors
  if (error.message && error.message.includes("Firebase")) {
    return res.status(401).json({
      message: error.message,
    });
  }
  
  // Check for validation/authentication errors
  if (error.message && (
    error.message.includes("Invalid") || 
    error.message.includes("not found") || 
    error.message.includes("Missing") ||
    error.message.includes("required")
  )) {
    return res.status(400).json({
      message: error.message,
    });
  }
  
  // Default to 500 for unknown errors
  res.status(500).json({
    message: error.message || "Internal server error",
  });
});

// Background metrics collection and monitoring
let metricsInterval;

const startMetricsCollection = async () => {
  metricsInterval = setInterval(async () => {
    try {
      // Skip if database is not connected
      if (!isDbConnected()) {
        console.warn("⚠️  Database unavailable - skipping metrics collection");
        return;
      }

      // Collect metrics from all active users (using a placeholder userId)
      const userId = "system";
      const metrics = await getSystemMetrics(userId);

      // Emit to all connected clients
      io.to("metrics").emit("metrics:update", {
        timestamp: new Date(),
        ...metrics,
      });

      // Generate alerts if thresholds exceeded
      const alerts = await generateMetricAlerts(userId, metrics);
      if (alerts.count > 0) {
        io.to("alerts").emit("alerts:new", alerts.alerts);
        alerts.alerts.forEach((alert) => {
          io.to("alerts").emit("alert:new", {
            alertId: alert._id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            resourceType: alert.resourceType,
            resourceId: alert.resourceId,
            timestamp: new Date(),
          });
        });
      }

      clearMetricsCache();
    } catch (error) {
      console.error("Error in metrics collection:", error.message);
    }
  }, 10000); // Collect every 10 seconds
};

async function startServer() {
  try {
    console.log("🚀 [Server] Starting backend server...");
    console.log(`📍 [Server] Environment: ${config.nodeEnv}`);
    
    // Validate GitHub token for repository write operations
    if (!config.githubToken) {
      console.warn("⚠️  [CRITICAL] GitHub Personal Access Token (GITHUB_TOKEN) is not configured.");
      console.warn("⚠️  [CRITICAL] Jenkins pipeline generation and repository write operations will FAIL.");
      console.warn("⚠️  [CRITICAL] Set process.env.GITHUB_TOKEN with a PAT that has 'repo' scope.");
    } else {
      console.log("✅ [GitHub] Personal Access Token (GITHUB_TOKEN) is configured");
      console.log("✅ [GitHub] Token length:", config.githubToken.length);
      console.log("✅ [GitHub] Token prefix:", config.githubToken.substring(0, 4) + "...");
    }
    
    // Try to connect to MongoDB
    console.log("🔄 [Server] Attempting MongoDB connection...");
    try {
      const connected = await connectDb();
      if (connected) {
        console.log("✅ [Server] MongoDB connection successful!");
      } else {
        console.warn("⚠️ [Server] MongoDB connection failed - using local fallback");
      }
    } catch (dbError) {
      console.warn("⚠️ [Server] MongoDB connection error:", dbError.message);
      console.warn("⚠️ [Server] Starting server without database connection...");
      console.warn("⚠️ [Server] Database will be available once MongoDB is running.");
    }
    // Check Docker daemon availability
    console.log("🔄 [Server] Checking Docker daemon...");
    try {
      await initializeDockerCheck();
    } catch (dockerError) {
      console.warn("⚠️ [Server] Docker daemon check failed:", dockerError.message);
      console.warn("⚠️ [Server] Docker monitoring will not be available");
    }

    // Check Jenkins server availability
    console.log("🔄 [Server] Checking Jenkins server...");
    try {
      await initializeJenkinsCheck();
    } catch (jenkinsError) {
      console.warn("⚠️ [Server] Jenkins server check failed:", jenkinsError.message);
      console.warn("⚠️ [Server] Deployment tracking will use mock data until Jenkins is available");
    }

    // Start server - bind to 0.0.0.0 for Docker/EC2 external access
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ Backend listening on port ${PORT}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`📍 API Base: http://0.0.0.0:${PORT}/api`);
      console.log(`🌐 Accessible at: http://localhost:${PORT}/api (local)`);
      console.log(`🚀 Docker/EC2: Accessible on all network interfaces on port ${PORT}`);
      console.log(`🔌 Socket.io: ws://0.0.0.0:${PORT}`);
      
      console.log("Registered Deployment Routes:");
      console.log("- POST /api/deployment/one-click-validate");
      console.log("- POST /api/deployment/start");
      console.log("- GET  /api/deployment/status/:id");

      if (existsSync(frontendDistPath)) {
        console.log(`✅ Frontend: Serving static files from ${frontendDistPath}`);
        console.log(`🖥️  Web UI: http://localhost:${PORT} (local)`);
      } else {
        console.warn(`⚠️  Frontend dist not found at ${frontendDistPath}`);
      }
      
      if (!isDbConnected()) {
        console.log("⚠️  MongoDB is not connected. Some features will not work.");
        console.log("    To restore: Check MONGO_URI and restart the server");
      } else {
        console.log("✅ MongoDB connected");
      }
      
      console.log(`✅ [Server] All systems ready!`);
      console.log(`${'='.repeat(60)}\n`);
    });

    // Start metrics collection
    startMetricsCollection();

    // Start Jenkins monitoring for WebSocket updates
    try {
      const { startJenkinsMonitoring } = await import("./services/jenkinsService.js");
      const stopJenkinsMonitoring = startJenkinsMonitoring(io);
      console.log("🔨 Jenkins monitoring started for real-time updates");
      
      // Handle graceful shutdown
      process.on("SIGTERM", () => {
        console.log("⏹️  Stopping Jenkins monitoring...");
        stopJenkinsMonitoring();
      });
    } catch (error) {
      console.warn("⚠️  Could not start Jenkins monitoring:", error.message);
    }

    // Start Docker monitoring for WebSocket updates
    try {
      const { startContainerMonitoring } = await import("./services/dockerService.js");
      const stopDockerMonitoring = await startContainerMonitoring(io);
      console.log("🐳 Docker container monitoring started for real-time updates");
      
      // Handle graceful shutdown
      process.on("SIGTERM", () => {
        console.log("⏹️  Stopping Docker monitoring...");
        stopDockerMonitoring();
      });
    } catch (error) {
      console.warn("⚠️  Could not start Docker monitoring:", error.message);
    }

    // Handle graceful shutdown on SIGTERM
    let isShuttingDown = false;
    
    process.on("SIGTERM", async () => {
      if (isShuttingDown) return; // Prevent multiple shutdown attempts
      isShuttingDown = true;
      
      console.log("⏹️  [Server] Received SIGTERM signal - graceful shutdown...");
      
      // Stop accepting new connections
      server.close(async () => {
        console.log("✅ [Server] HTTP server closed");
        
        // Close database connection
        try {
          await closeDb();
        } catch (error) {
          console.error("❌ [DB] Error closing database:", error.message);
        }
        
        // Close Socket.io connections gracefully
        io.close();
        console.log("✅ [Server] Socket.io closed");
        
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds if graceful close is taking too long
      setTimeout(() => {
        console.error("❌ [Server] Graceful shutdown timeout - forcing exit");
        // Exit 0 to indicate controlled shutdown, not a crash
        process.exit(0);
      }, 30000);
    });

    // Handle uncaught exceptions - log but don't crash server
    process.on("uncaughtException", (error) => {
      console.error("❌ [Server] Uncaught exception handled safely:", error.message);
      console.error("📍 [Server] Stack trace:", error.stack);
      console.warn("⚠️  Runtime error handled safely - server continues running");
      // DO NOT call process.exit(1) - keep server alive
    });

    process.on("unhandledRejection", (reason) => {
      console.error("❌ [Server] Unhandled rejection handled safely:", reason);
      if (reason instanceof Error) {
        console.error("📍 [Server] Stack trace:", reason.stack);
      }
      console.warn("⚠️  Runtime error handled safely - server continues running");
      // DO NOT call process.exit(1) - keep server alive
    });

  } catch (error) {
    console.error("❌ [Server] Startup error - attempting graceful recovery:", error.message);
    console.error("📍 [Server] Stack trace:", error.stack);
    console.warn("⚠️  [Server] Server startup encountered an error - will continue running");
    // Continue running instead of crashing - allows manual recovery
  }
}

startServer();
