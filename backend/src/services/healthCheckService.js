import { promisify } from "util";
import { exec } from "child_process";
import axios from "axios";

/**
 * Health Check Service
 * Verifies deployment health and container status
 */

const execAsync = promisify(exec);

/**
 * Check if container is running
 */
export async function isContainerRunning(containerName) {
  try {
    const { stdout } = await execAsync(`docker ps --filter name=${containerName} --format "{{.Names}}"`);
    return stdout.trim() === containerName;
  } catch (error) {
    console.error("Error checking container status:", error.message);
    return false;
  }
}

/**
 * Get container status
 */
export async function getContainerStatus(containerName) {
  try {
    const { stdout } = await execAsync(
      `docker ps -a --filter name=${containerName} --format "{{.Status}}{{.State}}"`
    );
    return stdout.trim();
  } catch (error) {
    console.error("Error getting container status:", error.message);
    return null;
  }
}

/**
 * Check if port is responding
 */
export async function isPortResponding(port, timeout = 5000) {
  try {
    const response = await axios.get(`http://localhost:${port}/`, { timeout });
    return response.status === 200 || response.status < 400;
  } catch (error) {
    return false;
  }
}

/**
 * Check if health endpoint is responding
 */
export async function checkHealthEndpoint(port, path = "/health", timeout = 5000) {
  try {
    const response = await axios.get(`http://localhost:${port}${path}`, { timeout });
    return response.status === 200;
  } catch (error) {
    // Try root path if health endpoint fails
    try {
      const response = await axios.get(`http://localhost:${port}/`, { timeout });
      return response.status === 200 || response.status < 400;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(containerName, lines = 50) {
  try {
    const { stdout } = await execAsync(`docker logs --tail ${lines} ${containerName}`);
    return stdout;
  } catch (error) {
    return `Error fetching logs: ${error.message}`;
  }
}

/**
 * Get container resource usage
 */
export async function getContainerMetrics(containerName) {
  try {
    const { stdout } = await execAsync(
      `docker stats ${containerName} --no-stream --format "{{json .}}"`
    );
    const stats = JSON.parse(stdout);
    return {
      cpuPercent: stats.CPUPerc || "0%",
      memoryPercent: stats.MemPerc || "0%",
      memory: stats.MemUsage || "0B",
      networkIn: stats.NetIO ? stats.NetIO.split("/")[0] : "0B",
      networkOut: stats.NetIO ? stats.NetIO.split("/")[1] : "0B",
    };
  } catch (error) {
    return null;
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(containerName, port, maxAttempts = 10) {
  const results = {
    containerRunning: false,
    portResponding: false,
    healthEndpoint: false,
    metrics: null,
    logs: null,
    status: "unknown",
    message: "",
    attempts: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    results.attempts = attempt;

    // Check if container is running
    results.containerRunning = await isContainerRunning(containerName);
    if (!results.containerRunning) {
      const status = await getContainerStatus(containerName);
      results.message = `Container not running. Status: ${status}`;
      results.status = "error";

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      return results;
    }

    // Check if port is responding
    results.portResponding = await isPortResponding(port, 3000);
    if (!results.portResponding) {
      results.message = `Port ${port} not responding`;
      results.status = "warning";

      if (attempt < maxAttempts) {
        console.log(`Health check attempt ${attempt}/${maxAttempts}: Waiting for port to respond...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
    }

    // Check health endpoint
    results.healthEndpoint = await checkHealthEndpoint(port);

    // Get metrics
    results.metrics = await getContainerMetrics(containerName);

    // Get logs
    results.logs = await getContainerLogs(containerName, 20);

    // Determine overall status
    if (results.containerRunning && results.portResponding) {
      results.status = "healthy";
      results.message = "Container is healthy and responsive";
      return results;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (results.containerRunning && !results.portResponding) {
    results.status = "unhealthy";
    results.message = "Container running but not responding";
  } else if (!results.containerRunning) {
    results.status = "error";
    results.message = "Container is not running";
  }

  return results;
}

/**
 * Monitor deployment health over time
 */
export async function monitorDeploymentHealth(containerName, port, interval = 30000, duration = 300000) {
  const startTime = Date.now();
  const healthHistory = [];

  return new Promise((resolve) => {
    const healthCheckInterval = setInterval(async () => {
      const health = await performHealthCheck(containerName, port, 1);
      healthHistory.push({
        timestamp: new Date(),
        ...health,
      });

      if (Date.now() - startTime > duration) {
        clearInterval(healthCheckInterval);
        resolve({
          success: true,
          duration: Date.now() - startTime,
          checks: healthHistory.length,
          history: healthHistory,
          finalStatus: healthHistory[healthHistory.length - 1]?.status || "unknown",
        });
      }
    }, interval);
  });
}

/**
 * Retry deployment health check with backoff
 */
export async function retryHealthCheck(containerName, port, maxRetries = 5, initialDelay = 2000) {
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Health check attempt ${attempt}/${maxRetries}...`);
    const result = await performHealthCheck(containerName, port, 1);

    if (result.status === "healthy") {
      return {
        success: true,
        result,
        attempts: attempt,
      };
    }

    if (attempt < maxRetries) {
      console.log(`Waiting ${delay}ms before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 10000); // Exponential backoff, max 10s
    }
  }

  const finalResult = await performHealthCheck(containerName, port, 1);
  return {
    success: false,
    result: finalResult,
    attempts: maxRetries,
  };
}

/**
 * Check health of deployed EC2 application
 */
export async function checkDeployedApplicationHealth(applicationUrl, timeout = 5000) {
  try {
    if (!applicationUrl) {
      return {
        success: false,
        status: "no_url",
        isLive: false,
        message: "No application URL provided",
      };
    }

    try {
      const response = await axios.get(applicationUrl, {
        timeout,
        validateStatus: () => true, // Accept any status code
      });

      const isHealthy = response.status >= 200 && response.status < 300;
      
      return {
        success: true,
        status: isHealthy ? "healthy" : "unhealthy",
        isLive: isHealthy,
        httpStatus: response.status,
        message: isHealthy ? "Application is live" : `Application returned HTTP ${response.status}`,
        responseTime: response.duration || null,
      };
    } catch (error) {
      return {
        success: false,
        status: "unhealthy",
        isLive: false,
        message: `Health check failed: ${error.message}`,
        error: error.message,
      };
    }
  } catch (error) {
    return {
      success: false,
      status: "error",
      isLive: false,
      message: `Error checking application health: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Get deployment health status
 */
export async function getDeploymentHealthStatus(deployment) {
  if (!deployment) {
    return {
      success: false,
      status: "unknown",
      isLive: false,
      message: "Deployment not found",
    };
  }

  const applicationUrl = deployment.applicationUrl || 
    (deployment.deploymentEndpoint?.publicIp 
      ? `http://${deployment.deploymentEndpoint.publicIp}:${deployment.deploymentEndpoint.containerPort || 3000}`
      : null);

  if (!applicationUrl) {
    return {
      success: false,
      status: "unknown",
      isLive: false,
      message: "No application URL available",
    };
  }

  return await checkDeployedApplicationHealth(applicationUrl);
}

