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
import { connectDb, isDbConnected } from "./db.js";
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
import { verifyAuthToken, verifyToken } from "./middleware/authMiddleware.js";
import { handleGitHubWebhook } from "./controllers/webhookController.js";
import { getSystemMetrics, clearMetricsCache } from "./services/metricsService.js";
import { generateMetricAlerts } from "./services/alertService.js";
import { initializeSocketEvents } from "./services/socketEventsService.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

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
    dbConnected: isDbConnected()
  });
});

// Test endpoint
app.post("/api/test", (req, res) => {
  res.json({ ok: true, message: "Backend is responding", body: req.body });
});

// Public routes
app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.post("/api/webhook", handleGitHubWebhook);
app.post("/webhook", handleGitHubWebhook);

// Protected routes
app.use("/api/dashboard", verifyToken, dashboardRoutes);
app.use("/api/metrics", verifyToken, metricsRoutes);
app.use("/api/deployments", verifyToken, deploymentRoutes);
app.use("/api/alerts", verifyToken, alertRoutes);
app.use("/api/monitoring", verifyToken, monitoringRoutes);
app.use("/api/analyze", verifyToken, analyzeRoutes);
app.use("/api/logs", verifyToken, logRoutes);
app.use("/api/automation", verifyToken, automationRoutes);
app.use("/api/jenkins", jenkinsRoutes);
app.use("/api/docker", dockerRoutes);
app.use("/api", compatibilityRoutes);
app.use("/", compatibilityRoutes);

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
  app.use(express.static(frontendDistPath));

  // Serve frontend for all non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/webhook")) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
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
      console.log(`✅ Backend listening on port ${PORT}`);
      console.log(`📍 API Base: http://0.0.0.0:${PORT}/api`);
      console.log(`🌐 Accessible at: http://localhost:${PORT}/api (local)`);
      console.log(`🚀 Docker/EC2: Accessible on all network interfaces on port ${PORT}`);
      console.log(`🔌 Socket.io: ws://0.0.0.0:${PORT}`);
      if (!isDbConnected()) {
        console.log("⚠️  MongoDB is not connected. Some features will not work.");
        console.log("    To restore: Check MONGO_URI and restart the server");
      } else {
        console.log("✅ [Server] All systems ready!");
      }
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
    process.on("SIGTERM", async () => {
      console.log("⏹️  [Server] Received SIGTERM signal - graceful shutdown...");
      server.close(() => {
        console.log("✅ [Server] HTTP server closed");
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("❌ [Server] Uncaught exception:", error);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("❌ [Server] Unhandled rejection:", reason);
      process.exit(1);
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
