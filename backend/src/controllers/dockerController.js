import {
  getContainers,
  getContainerStats,
  getAllContainerStats,
  getContainerHealth,
  getContainerLogs,
  getDockerInfo,
  stopContainer,
  restartContainer,
  removeContainer,
  runContainer,
  deployContainer,
  recordDeployment,
  getDeploymentHistory,
  getDeploymentStats,
  getContainerHealthHistory,
  recordContainerHealth,
} from "../services/dockerService.js";

/**
 * GET /api/docker/containers
 * Get list of all running containers
 */
export const getContainersList = async (req, res) => {
  try {
    console.log("📨 [GET] /api/docker/containers");
    
    const result = await getContainers();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        containers: [],
      });
    }

    res.json({
      success: true,
      containers: result.containers,
      total: result.total,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching containers:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/containers/stats
 * Get stats for all containers
 */
export const getAllStats = async (req, res) => {
  try {
    console.log("📨 [GET] /api/docker/containers/stats");
    
    const result = await getAllContainerStats();

    res.json({
      success: result.success,
      stats: result.stats,
      count: result.count,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching all stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/containers/:containerId/stats
 * Get stats for specific container
 */
export const getStats = async (req, res) => {
  try {
    const { containerId } = req.params;
    console.log("📨 [GET] /api/docker/containers/:containerId/stats", { containerId });
    
    const result = await getContainerStats(containerId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      stats: result.stats,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/containers/:containerId/health
 * Get container health status
 */
export const getHealth = async (req, res) => {
  try {
    const { containerId } = req.params;
    console.log("📨 [GET] /api/docker/containers/:containerId/health", { containerId });
    
    const result = await getContainerHealth(containerId);

    res.json({
      success: result.success,
      containerId: result.containerId,
      health: result.health,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching health:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/containers/:containerId/health/history
 * Get container health history
 */
export const getHealthHistory = async (req, res) => {
  try {
    const { containerId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    console.log("📨 [GET] /api/docker/containers/:containerId/health/history", { containerId, limit });
    
    const result = await getContainerHealthHistory(containerId, limit);

    res.json({
      success: result.success,
      containerId: result.containerId,
      history: result.history,
      count: result.count,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching health history:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/containers/:containerId/logs
 * Get container logs
 */
export const getLogs = async (req, res) => {
  try {
    const { containerId } = req.params;
    const lines = parseInt(req.query.lines) || 50;
    
    console.log("📨 [GET] /api/docker/containers/:containerId/logs", { containerId, lines });
    
    const result = await getContainerLogs(containerId, lines);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      containerId: result.containerId,
      logs: result.logs,
      count: result.logs.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching logs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/info
 * Get Docker system info
 */
export const getInfo = async (req, res) => {
  try {
    console.log("📨 [GET] /api/docker/info");
    
    const result = await getDockerInfo();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      info: result.info,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching Docker info:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/docker/containers/:containerId/restart
 * Restart a container
 */
export const restartContainerHandler = async (req, res) => {
  try {
    const { containerId } = req.params;
    const { timeout = 10 } = req.body;
    
    console.log("📨 [POST] /api/docker/containers/:containerId/restart", { containerId, timeout });
    
    const result = await restartContainer(containerId, timeout);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      action: "restarted",
      containerId: result.containerId,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error restarting container:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/docker/containers/:containerId/stop
 * Stop a container
 */
export const stopContainerHandler = async (req, res) => {
  try {
    const { containerId } = req.params;
    const { timeout = 10 } = req.body;
    
    console.log("📨 [POST] /api/docker/containers/:containerId/stop", { containerId, timeout });
    
    const result = await stopContainer(containerId, timeout);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      action: "stopped",
      containerId: result.containerId,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error stopping container:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/docker/containers/:containerId/remove
 * Remove a container
 */
export const removeContainerHandler = async (req, res) => {
  try {
    const { containerId } = req.params;
    const { force = false } = req.body;
    
    console.log("📨 [POST] /api/docker/containers/:containerId/remove", { containerId, force });
    
    const result = await removeContainer(containerId, force);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      action: "removed",
      containerId: result.containerId,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error removing container:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/docker/deploy
 * Deploy container (stop old, run new, record history)
 */
export const deployContainerHandler = async (req, res) => {
  try {
    const { oldContainerId, image, newContainerName, ports, env, volumes, version, previousVersion, environment } = req.body;
    const userId = req.user?.userId || req.user?.uid || req.user?.id || req.body.userId || "system";
    
    console.log("📨 [POST] /api/docker/deploy", { oldContainerId, newContainerName, version });
    
    // Deploy container
    const deployResult = await deployContainer({
      oldContainerId,
      image,
      newContainerName,
      ports,
      env,
      volumes,
      userId,
    });

    if (!deployResult.success) {
      return res.status(400).json({
        success: false,
        error: deployResult.error,
      });
    }

    // Record deployment to MongoDB
    const recordResult = await recordDeployment({
      userId,
      version,
      previousVersion,
      status: "success",
      environment: environment || "production",
      containers: [
        {
          name: newContainerName,
          image,
          status: "running",
          ports,
        },
      ],
      deploymentType: "manual",
      deployedBy: userId,
      startTime: new Date(Date.now() - 30000),
      endTime: new Date(),
      duration: 30000,
      logs: deployResult.logs,
    });

    res.json({
      success: true,
      deployment: recordResult.deployment,
      newContainerId: deployResult.newContainerId,
      oldContainerId: deployResult.oldContainerId,
      logs: deployResult.logs,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error deploying container:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/deployments
 * Get deployment history
 */
export const getDeployments = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid || req.user?.id || req.query.userId || "system";
    const limit = parseInt(req.query.limit) || 20;
    
    console.log("📨 [GET] /api/docker/deployments", { userId, limit });
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId required",
      });
    }

    const result = await getDeploymentHistory(userId, limit);

    res.json({
      success: result.success,
      deployments: result.deployments,
      count: result.count,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching deployments:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/docker/deployments/stats
 * Get deployment statistics
 */
export const getDeploymentStatsHandler = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.uid || req.user?.id || req.query.userId || "system";
    const days = parseInt(req.query.days) || 30;
    
    console.log("📨 [GET] /api/docker/deployments/stats", { userId, days });
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId required",
      });
    }

    const result = await getDeploymentStats(userId, days);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      stats: result.stats,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Error fetching deployment stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
