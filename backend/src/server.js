import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import router from "./routes/dashboardRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import analyzeRoutes from "./routes/analyzeRoutes.js";
import monitoringRoutes from "./routes/monitoringRoutes.js";
import { verifyToken } from "./middleware/authMiddleware.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(morgan("dev"));

// Public routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api", verifyToken, router);
app.use("/api", monitoringRoutes);
app.use("/api", analyzeRoutes);

if (existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath));

  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    message: error.message || "Internal server error",
  });
});

async function startServer() {
  try {
    await connectDb();
    app.listen(config.port, () => {
      console.log(`Backend listening on port ${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

startServer();
