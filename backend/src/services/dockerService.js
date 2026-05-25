import { exec, execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { Log } from "../models/Logs.js";
import { ContainerHealth } from "../models/ContainerHealth.js";
import { Deployment } from "../models/Deployment.js";
import { createAlert } from "./alertService.js";
import { emitContainerStatsUpdate, emitContainerStatusChange } from "./socketEventsService.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Docker daemon availability tracking
let dockerAvailable = null;
let dockerCheckTime = 0;
const DOCKER_CHECK_INTERVAL = 10000; // 10 seconds

/**
 * Check if Docker daemon is available
 * Caches the result to avoid constant checking
 */
export async function isDockerAvailable() {
  const now = Date.now();
  
  // Use cached result if recent
  if (dockerAvailable !== null && (now - dockerCheckTime) < DOCKER_CHECK_INTERVAL) {
    return dockerAvailable;
  }

  try {
    // Check if socket file exists
    const socketPath = process.env.DOCKER_HOST || "/var/run/docker.sock";
    if (socketPath.startsWith("unix://")) {
      const path = socketPath.replace("unix://", "");
      if (!existsSync(path)) {
        console.warn(`⚠️  [Docker] Socket not found: ${path}`);
        dockerAvailable = false;
        dockerCheckTime = now;
        return false;
      }
    }

    // Try a quick docker command
    await execFileAsync("docker", ["version", "--format={{.Server.Version}}"]);
    
    console.log("✅ [Docker] Daemon connected and available");
    dockerAvailable = true;
    dockerCheckTime = now;
    return true;
  } catch (error) {
    console.warn("❌ [Docker] Daemon unavailable:", error.message);
    dockerAvailable = false;
    dockerCheckTime = now;
    return false;
  }
}

/**
 * Initialize Docker availability check on startup
 */
export async function initializeDockerCheck() {
  try {
    console.log("🔍 [Docker] Checking Docker daemon availability...");
    const available = await isDockerAvailable();
    if (available) {
      console.log("✅ [Docker] Docker daemon is ready");
    } else {
      console.warn("⚠️  [Docker] Docker daemon is not available");
      console.warn("   Mount /var/run/docker.sock to enable Docker monitoring");
    }
  } catch (error) {
    console.error("❌ [Docker] Error during initialization:", error.message);
  }
}

/**
 * Graceful fallback response when Docker is unavailable
 */
function unavailableResponse(type = "info") {
  const responses = {
    containers: {
      success: false,
      error: "Docker daemon not available. Mount /var/run/docker.sock in container.",
      dockerAvailable: false,
      containers: [],
      total: 0,
    },
    stats: {
      success: false,
      error: "Docker daemon not available. Mount /var/run/docker.sock in container.",
      dockerAvailable: false,
      stats: null,
    },
    info: {
      success: false,
      error: "Docker daemon not available. Mount /var/run/docker.sock in container.",
      dockerAvailable: false,
      info: null,
    },
    logs: {
      success: false,
      error: "Docker daemon not available.",
      dockerAvailable: false,
      logs: [],
    },
  };
  return responses[type] || responses.info;
}

/**
 * Safely escape shell arguments to prevent command injection
 */
function escapeShellArg(arg) {
  if (!arg || typeof arg !== "string") return "";
  // Only allow alphanumeric, hyphens, underscores, dots, and colons
  if (!/^[a-zA-Z0-9._:-]+$/.test(arg)) {
    throw new Error(`Invalid parameter: ${arg}`);
  }
  return arg;
}

/**
 * Get list of all containers
 */
export const getContainers = async () => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn("⚠️  [Docker] Docker unavailable - returning empty container list");
      return unavailableResponse("containers");
    }

    console.log("📦 [Docker] Fetching containers...");
    const { stdout } = await execAsync(
      'docker ps --format "{{json .}}" -a'
    );

    const lines = stdout.trim().split("\n").filter(l => l);
    const containers = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    console.log(`✅ [Docker] Found ${containers.length} containers`);

    return {
      success: true,
      containers,
      total: containers.length,
      dockerAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching containers:", error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      containers: [],
      total: 0,
    };
  }
};

/**
 * Get container stats (CPU, Memory, Network, etc.)
 */
export const getContainerStats = async (containerId) => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn(`⚠️  [Docker] Docker unavailable - cannot fetch stats for ${containerId}`);
      return unavailableResponse("stats");
    }

    console.log(`📊 [Docker] Fetching stats for container: ${containerId}`);
    const safeId = escapeShellArg(containerId);
    const { stdout } = await execAsync(
      `docker stats ${safeId} --no-stream --format "{{json .}}"`
    );

    const stats = JSON.parse(stdout.trim());
    console.log(`✅ [Docker] Stats retrieved for container: ${containerId}`);

    return {
      success: true,
      stats: {
        container: stats.Container || containerId,
        cpuPercent: parseFloat(stats.CPUPerc) || 0,
        memoryPercent: parseFloat(stats.MemPerc) || 0,
        memory: stats.MemUsage || "0B",
        networkIn: stats.NetIO?.split("/")[0] || "0B",
        networkOut: stats.NetIO?.split("/")[1] || "0B",
        blockIn: stats.BlockIO?.split("/")[0] || "0B",
        blockOut: stats.BlockIO?.split("/")[1] || "0B",
        pids: parseInt(stats.PIDs) || 0,
      },
      dockerAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching stats for", containerId, ":", error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      stats: null,
    };
  }
};

/**
 * Build Docker image
 */
export const buildImage = async (dockerfile, tag, buildContext = ".") => {
  try {
    const safeTag = escapeShellArg(tag);
    
    console.log(`🔨 [Docker] Building image: ${tag}`);

    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["build", "-f", dockerfile, "-t", safeTag, buildContext],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const logs = (stdout + stderr).split("\n").filter(l => l);

    // Save logs
    console.log(`✅ [Docker] Image built successfully: ${tag}`);

    return {
      success: true,
      tag,
      logs,
    };
  } catch (error) {
    console.error("❌ [Docker] Error building image:", error.message);
    return {
      success: false,
      error: error.message,
      tag,
      logs: [],
    };
  }
};

/**
 * Run Docker container
 */
export const runContainer = async (options) => {
  try {
    const {
      image,
      name,
      ports = [],
      env = [],
      volumes = [],
      detach = true,
      restart = "unless-stopped",
    } = options;

    console.log(`🚀 [Docker] Running container: ${name} from image ${image}`);

    // Validate inputs
    const safeImage = escapeShellArg(image);
    const safeName = name ? escapeShellArg(name) : null;
    const args = ["run"];

    if (detach) args.push("-d");
    if (safeName) args.push("--name", safeName);
    if (restart) args.push(`--restart=${escapeShellArg(restart)}`);

    ports.forEach(port => {
      const safePort = escapeShellArg(port);
      args.push("-p", safePort);
    });

    env.forEach(e => {
      if (typeof e !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(e)) {
        throw new Error(`Invalid environment variable: ${e}`);
      }
      args.push("-e", e);
    });

    volumes.forEach(vol => {
      if (typeof vol !== "string" || !vol.includes(":")) {
        throw new Error(`Invalid volume mapping: ${vol}`);
      }
      args.push("-v", vol);
    });

    args.push(safeImage);

    const { stdout, stderr } = await execFileAsync("docker", args);
    const containerId = (stdout + stderr).trim().split("\n")[0];

    console.log(`✅ [Docker] Container started: ${containerId}`);

    return {
      success: true,
      name,
      containerId,
      image,
    };
  } catch (error) {
    const dockerError = error.stderr || error.stdout || error.message;
    console.error("❌ [Docker] Error running container:", dockerError);
    return {
      success: false,
      error: dockerError.trim?.() || dockerError,
      name: options.name,
    };
  }
};

/**
 * Stop container
 */
export const stopContainer = async (containerId, timeout = 10) => {
  try {
    const safeId = escapeShellArg(containerId);
    const safeTimeout = escapeShellArg(String(timeout));
    
    console.log(`⏹️ [Docker] Stopping container: ${containerId}`);

    await execFileAsync("docker", ["stop", "-t", safeTimeout, safeId]);

    console.log(`✅ [Docker] Container stopped: ${containerId}`);

    return {
      success: true,
      containerId,
    };
  } catch (error) {
    console.error("❌ [Docker] Error stopping container:", error.message);
    return {
      success: false,
      error: error.message,
      containerId,
    };
  }
};

/**
 * Remove container
 */
export const removeContainer = async (containerId, force = false) => {
  try {
    const safeId = escapeShellArg(containerId);
    
    console.log(`🗑️ [Docker] Removing container: ${containerId}`);

    const args = ["rm"];
    if (force) args.push("-f");
    args.push(safeId);
    await execFileAsync("docker", args);

    console.log(`✅ [Docker] Container removed: ${containerId}`);

    return {
      success: true,
      containerId,
    };
  } catch (error) {
    console.error("❌ [Docker] Error removing container:", error.message);
    return {
      success: false,
      error: error.message,
      containerId,
    };
  }
};

/**
 * Get container logs
 */
export const getContainerLogs = async (containerId, lines = 50) => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn(`⚠️  [Docker] Docker unavailable - cannot fetch logs for ${containerId}`);
      return unavailableResponse("logs");
    }

    console.log(`📝 [Docker] Fetching logs for container: ${containerId}`);
    const safeId = escapeShellArg(containerId);
    const safeLines = escapeShellArg(String(lines));
    
    const { stdout } = await execFileAsync("docker", ["logs", "--tail", safeLines, safeId], {
      maxBuffer: 10 * 1024 * 1024,
    });

    const logLines = stdout.split("\n").filter(l => l);

    console.log(`✅ [Docker] Logs retrieved for container: ${containerId}`);
    return {
      success: true,
      containerId,
      logs: logLines,
      dockerAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching logs:", error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      containerId,
      logs: [],
    };
  }
};

/**
 * Get container health check
 */
const normalizeContainerHealth = (value) => {
  const health = String(value || "none").trim().replace(/^['"]|['"]$/g, "");
  return ["healthy", "unhealthy", "starting", "none"].includes(health)
    ? health
    : "none";
};

export const getContainerHealth = async (containerId) => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn(`⚠️  [Docker] Docker unavailable - cannot fetch health for ${containerId}`);
      return {
        success: false,
        error: "Docker daemon not available",
        dockerAvailable: false,
        containerId,
        health: "none",
      };
    }

    console.log(`🏥 [Docker] Checking health for container: ${containerId}`);
    const safeId = escapeShellArg(containerId);
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format={{.State.Health.Status}}",
      safeId,
    ]);

    const status = normalizeContainerHealth(stdout);

    console.log(`✅ [Docker] Health status for ${containerId}: ${status}`);
    return {
      success: true,
      containerId,
      health: status,
      dockerAvailable: true,
    };
  } catch (error) {
    console.error(`❌ [Docker] Error checking health for ${containerId}:`, error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      containerId,
      health: "none",
    };
  }
};

export const pruneUnusedImages = async () => {
  try {
    const { stdout, stderr } = await execFileAsync("docker", ["image", "prune", "-f"], {
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      logs: `${stdout || ""}${stderr || ""}`.split("\n").filter(Boolean),
    };
  } catch (error) {
    return {
      success: false,
      error: error.stderr || error.message,
      logs: [],
    };
  }
};

/**
 * Deploy container (stop old, run new)
 */
export const deployContainer = async (options) => {
  try {
    const {
      oldContainerId,
      image,
      newContainerName,
      ports,
      env,
      volumes,
      userId,
    } = options;

    console.log(`🔄 [Docker] Deploying new version of ${newContainerName}`);

    const logs = [];
    logs.push(`[${new Date().toISOString()}] Starting deployment...`);

    // Stop old container
    if (oldContainerId) {
      logs.push(`[${new Date().toISOString()}] Stopping old container: ${oldContainerId}`);
      const stopResult = await stopContainer(oldContainerId);
      if (!stopResult.success) {
        logs.push(`[${new Date().toISOString()}] Warning: Could not stop old container`);
      }
    }

    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run new container
    logs.push(`[${new Date().toISOString()}] Starting new container...`);
    const runResult = await runContainer({
      image,
      name: newContainerName,
      ports,
      env,
      volumes,
      detach: true,
      restart: "unless-stopped",
    });

    if (!runResult.success) {
      throw new Error(`Failed to start new container: ${runResult.error}`);
    }

    logs.push(`[${new Date().toISOString()}] New container started: ${runResult.containerId}`);

    // Wait for container to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check health
    const healthResult = await getContainerHealth(runResult.containerId);
    logs.push(`[${new Date().toISOString()}] Container health: ${healthResult.health}`);

    // Remove old container after successful deployment
    if (oldContainerId) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      logs.push(`[${new Date().toISOString()}] Removing old container...`);
      await removeContainer(oldContainerId, true);
      logs.push(`[${new Date().toISOString()}] Old container removed`);
    }

    const pruneResult = await pruneUnusedImages();
    if (pruneResult.success) {
      logs.push(`[${new Date().toISOString()}] Removed unused Docker images`);
      logs.push(...pruneResult.logs.map((line) => `  ${line}`));
    } else {
      logs.push(`[${new Date().toISOString()}] Docker image prune warning: ${pruneResult.error}`);
    }

    logs.push(`[${new Date().toISOString()}] Deployment completed successfully`);

    // Save deployment logs if userId provided
    if (userId) {
      await Log.create({
        userId,
        source: "docker",
        logType: "info",
        containerName: newContainerName,
        message: "Container deployment successful",
        rawLog: logs.join("\n"),
        metadata: {
          image,
          oldContainerId,
          newContainerId: runResult.containerId,
        },
      });
    }

    console.log(`✅ [Docker] Deployment successful`);

    return {
      success: true,
      oldContainerId,
      newContainerId: runResult.containerId,
      logs,
    };
  } catch (error) {
    console.error("❌ [Docker] Deployment error:", error.message);
    return {
      success: false,
      error: error.message,
      logs: [],
    };
  }
};

/**
 * Get Docker system info
 */
export const getDockerInfo = async () => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn("⚠️  [Docker] Docker unavailable - returning empty system info");
      return unavailableResponse("info");
    }

    console.log("🐳 [Docker] Fetching Docker system info...");
    const { stdout } = await execAsync("docker info --format json");
    const info = JSON.parse(stdout);

    console.log(`✅ [Docker] System info retrieved: ${info.ContainersRunning} running, ${info.ContainersStopped} stopped`);

    return {
      success: true,
      dockerAvailable: true,
      info: {
        containers: info.Containers,
        containersPaused: info.ContainersPaused,
        containersRunning: info.ContainersRunning,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        serverVersion: info.ServerVersion,
        osType: info.OSType,
        architecture: info.Architecture,
      },
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching info:", error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      info: null,
    };
  }
};

/**
 * Restart container
 */
export const restartContainer = async (containerId, timeout = 10) => {
  try {
    const safeId = escapeShellArg(containerId);
    const safeTimeout = escapeShellArg(String(timeout));

    console.log(`🔄 [Docker] Restarting container: ${containerId}`);

    await execAsync(`docker restart -t ${safeTimeout} ${safeId}`);

    console.log(`✅ [Docker] Container restarted: ${containerId}`);

    // Record restart event
    await ContainerHealth.updateOne(
      { containerId },
      {
        $set: {
          lastRestartTime: new Date(),
          updatedAt: new Date(),
        },
        $inc: { restarts: 1 },
        $push: {
          events: {
            type: "restart",
            message: `Container restarted by user`,
            timestamp: new Date(),
          },
        },
      },
      { upsert: false }
    );

    return {
      success: true,
      containerId,
      action: "restarted",
    };
  } catch (error) {
    console.error("❌ [Docker] Error restarting container:", error.message);
    return {
      success: false,
      error: error.message,
      containerId,
    };
  }
};

/**
 * Get all container stats
 */
export const getAllContainerStats = async () => {
  try {
    // Check if Docker is available first
    if (!(await isDockerAvailable())) {
      console.warn("⚠️  [Docker] Docker unavailable - cannot fetch all container stats");
      return {
        success: false,
        error: "Docker daemon not available. Mount /var/run/docker.sock in container.",
        dockerAvailable: false,
        stats: [],
        count: 0,
      };
    }

    console.log("📊 [Docker] Fetching stats for all containers...");
    const { stdout } = await execAsync(
      'docker stats --all --no-stream --format "{{json .}}"'
    );

    const lines = stdout.trim().split("\n").filter(l => l);
    const stats = lines.map(line => {
      try {
        const stat = JSON.parse(line);
        return {
          container: stat.Container,
          containerName: stat.Names,
          cpuPercent: parseFloat(stat.CPUPerc) || 0,
          memoryPercent: parseFloat(stat.MemPerc) || 0,
          memory: stat.MemUsage || "0B",
          networkIn: stat.NetIO?.split("/")[0] || "0B",
          networkOut: stat.NetIO?.split("/")[1] || "0B",
          blockIn: stat.BlockIO?.split("/")[0] || "0B",
          blockOut: stat.BlockIO?.split("/")[1] || "0B",
          pids: parseInt(stat.PIDs) || 0,
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    console.log(`✅ [Docker] Retrieved stats for ${stats.length} containers`);

    return {
      success: true,
      dockerAvailable: true,
      stats,
      count: stats.length,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching all stats:", error.message);
    return {
      success: false,
      error: error.message,
      dockerAvailable: await isDockerAvailable(),
      stats: [],
      count: 0,
    };
  }
};

/**
 * Record container health snapshot to MongoDB
 */
export const recordContainerHealth = async (containerId, healthData) => {
  try {
    const record = new ContainerHealth({
      containerId: healthData.containerId,
      containerName: healthData.containerName,
      image: healthData.image,
      status: healthData.status,
      health: normalizeContainerHealth(healthData.health),
      cpuPercent: healthData.cpuPercent || 0,
      memoryPercent: healthData.memoryPercent || 0,
      memoryUsage: healthData.memoryUsage,
      memoryLimit: healthData.memoryLimit,
      networkIn: healthData.networkIn,
      networkOut: healthData.networkOut,
      blockIn: healthData.blockIn,
      blockOut: healthData.blockOut,
      pids: healthData.pids || 0,
      restarts: healthData.restarts || 0,
      uptime: healthData.uptime || 0,
      metadata: {
        ports: healthData.ports || [],
        labels: healthData.labels || {},
        mounts: healthData.mounts || [],
      },
      lastHealthCheckTime: new Date(),
    });

    await record.save();

    return {
      success: true,
      recordId: record._id,
    };
  } catch (error) {
    console.error("❌ [Docker] Error recording health:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get container health history (last N records)
 */
export const getContainerHealthHistory = async (containerId, limit = 50) => {
  try {
    const history = await ContainerHealth.find({ containerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      containerId,
      history,
      count: history.length,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching health history:", error.message);
    return {
      success: false,
      error: error.message,
      history: [],
      count: 0,
    };
  }
};

/**
 * Record deployment to MongoDB
 */
export const recordDeployment = async (deploymentData) => {
  try {
    const deployment = new Deployment({
      userId: deploymentData.userId,
      version: deploymentData.version,
      previousVersion: deploymentData.previousVersion,
      status: deploymentData.status || "success",
      environment: deploymentData.environment || "production",
      containers: deploymentData.containers || [],
      deploymentType: deploymentData.deploymentType || "manual",
      deployedBy: deploymentData.deployedBy,
      startTime: deploymentData.startTime,
      endTime: deploymentData.endTime,
      duration: deploymentData.duration,
      logs: deploymentData.logs || [],
    });

    await deployment.save();

    console.log(`✅ [Docker] Deployment recorded: ${deployment._id}`);

    return {
      success: true,
      deploymentId: deployment._id,
      deployment,
    };
  } catch (error) {
    console.error("❌ [Docker] Error recording deployment:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get deployment history
 */
export const getDeploymentHistory = async (userId, limit = 20) => {
  try {
    const deployments = await Deployment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      userId,
      deployments,
      count: deployments.length,
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching deployment history:", error.message);
    return {
      success: false,
      error: error.message,
      deployments: [],
      count: 0,
    };
  }
};

/**
 * Get deployment statistics
 */
export const getDeploymentStats = async (userId, days = 30) => {
  try {
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deployments = await Deployment.find({
      userId,
      createdAt: { $gte: sinceDate },
    }).lean();

    const total = deployments.length;
    const successful = deployments.filter(d => d.status === "success").length;
    const failed = deployments.filter(d => d.status === "failed").length;
    const rolledBack = deployments.filter(d => d.status === "rolled-back").length;

    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
    const avgDuration = total > 0
      ? Math.round(deployments.reduce((sum, d) => sum + (d.duration || 0), 0) / total)
      : 0;

    const byEnvironment = {
      development: deployments.filter(d => d.environment === "development").length,
      staging: deployments.filter(d => d.environment === "staging").length,
      production: deployments.filter(d => d.environment === "production").length,
    };

    return {
      success: true,
      stats: {
        total,
        successful,
        failed,
        rolledBack,
        successRate,
        avgDuration,
        byEnvironment,
        period: `${days} days`,
      },
    };
  } catch (error) {
    console.error("❌ [Docker] Error fetching deployment stats:", error.message);
    return {
      success: false,
      error: error.message,
      stats: null,
    };
  }
};

/**
 * Start monitoring container health (polling)
 */
export const startContainerMonitoring = async (io) => {
  try {
    const monitoringInterval = setInterval(async () => {
      const containerResult = await getContainers();

      if (!containerResult.success) {
        console.error("❌ [Docker Monitor] Failed to get containers");
        return;
      }

      for (const container of containerResult.containers) {
        const statsResult = await getContainerStats(container.ID);
        const healthResult = await getContainerHealth(container.ID);

        if (statsResult.success && healthResult.success) {
          const healthData = {
            containerId: container.ID,
            containerName: container.Names,
            image: container.Image,
            status: container.State,
            health: healthResult.health,
            ...statsResult.stats,
          };

          // Record to database
          await recordContainerHealth(container.ID, healthData);

          // Emit WebSocket event
          if (io) {
            io.to("docker-monitor").emit("docker:container-update", {
              containerId: container.ID,
              containerName: container.Names,
              ...healthData,
              timestamp: new Date(),
            });

            emitContainerStatusChange(healthData);
            emitContainerStatsUpdate({
              containerId: container.ID,
              containerName: container.Names,
              cpu: healthData.cpuPercent,
              memory: healthData.memoryPercent,
              network: {
                in: healthData.networkIn,
                out: healthData.networkOut,
              },
            });
          }

          if (container.State !== "running") {
            const recentCrashAlert = await Log.findOne({
              source: "docker",
              logType: "error",
              containerName: container.Names,
              timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
            });

            if (!recentCrashAlert) {
              await Log.create({
                userId: "system",
                source: "docker",
                logType: "error",
                containerName: container.Names,
                message: `Container ${container.Names} is ${container.State}`,
                rawLog: JSON.stringify(container),
                metadata: { stage: "container-monitor", status: container.State },
              });

              await createAlert("system", {
                type: "container_stopped",
                severity: "critical",
                title: "Container Stopped",
                message: `${container.Names} is ${container.State}`,
                resourceType: "container",
                resourceId: container.ID,
                metadata: { container: container.Names },
              });
            }
          }
        }
      }
    }, 15000); // Monitor every 15 seconds

    console.log("✅ [Docker Monitor] Started container health monitoring");

    // Return cleanup function
    return () => {
      clearInterval(monitoringInterval);
      console.log("🛑 [Docker Monitor] Stopped monitoring");
    };
  } catch (error) {
    console.error("❌ [Docker Monitor] Error:", error.message);
    return () => {};
  }
};
