import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Get pipeline status from GitHub
 */
export const getPipelineStatus = async (req, res) => {
  try {
    const { GITHUB_TOKEN, REPO_OWNER, REPO_NAME } = process.env;

    if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
      return res.status(400).json({
        error: "Missing GitHub credentials in .env",
        message:
          "Please set GITHUB_TOKEN, REPO_OWNER, and REPO_NAME in .env",
      });
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const latestRun = data.workflow_runs[0];

      if (!latestRun) {
        return res.json({
          status: "unknown",
          conclusion: null,
          workflow_name: "No workflows found",
          last_commit: "N/A",
          timestamp: new Date(),
        });
      }

      res.json({
        status: latestRun.status,
        conclusion: latestRun.conclusion,
        workflow_name: latestRun.name,
        last_commit: latestRun.head_commit?.message || "N/A",
        timestamp: latestRun.updated_at,
        run_number: latestRun.run_number,
        branch: latestRun.head_branch,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error("GitHub pipeline status timeout");
        return res.status(504).json({
          error: "GitHub API timeout",
          message: "GitHub is taking too long to respond",
        });
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error("Pipeline status error:", error);
    res.status(500).json({
      error: "Failed to fetch pipeline status",
      message: error.message,
    });
  }
};

/**
 * Get Docker logs
 */
export const getDockerLogs = async (req, res) => {
  try {
    const { CONTAINER_NAME } = process.env;

    if (!CONTAINER_NAME) {
      return res.status(400).json({
        error: "Missing CONTAINER_NAME in .env",
        message: "Please set CONTAINER_NAME in .env file",
      });
    }

    const { stdout, stderr } = await execAsync(
      `docker logs ${CONTAINER_NAME} --tail 50 --timestamps`
    );

    if (stderr) {
      console.warn("Docker logs warning:", stderr);
    }

    const logs = stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => ({
        timestamp: new Date(),
        message: line,
        type: line.includes("error") ? "error" : "info",
      }));

    res.json({
      container: CONTAINER_NAME,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("Docker logs error:", error);

    // Fallback: return demo logs if Docker is not available
    res.status(500).json({
      error: "Failed to fetch Docker logs",
      message: error.message,
      fallback: [
        {
          timestamp: new Date(),
          message: "[Demo] Application started successfully",
          type: "info",
        },
        {
          timestamp: new Date(),
          message: "[Demo] Server listening on port 5000",
          type: "info",
        },
      ],
    });
  }
};

/**
 * Get system metrics
 */
export const getSystemMetrics = async (req, res) => {
  try {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU load
    let cpuUsage = 0;
    if (cpus.length > 0) {
      const cpu = cpus[0];
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      cpuUsage = Math.round(((total - idle) / total) * 100);
    }

    // Get process memory usage
    const processMemory = process.memoryUsage();

    res.json({
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
        load: os.loadavg(),
      },
      memory: {
        total: Math.round(totalMemory / 1024 / 1024), // MB
        used: Math.round(usedMemory / 1024 / 1024), // MB
        free: Math.round(freeMemory / 1024 / 1024), // MB
        percent: Math.round((usedMemory / totalMemory) * 100),
        process: {
          rss: Math.round(processMemory.rss / 1024 / 1024), // MB
          heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024), // MB
        },
      },
      uptime: Math.round(process.uptime()), // seconds
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("System metrics error:", error);
    res.status(500).json({
      error: "Failed to fetch system metrics",
      message: error.message,
    });
  }
};

/**
 * Get alerts based on metrics
 */
export const getAlerts = async (req, res) => {
  try {
    const alerts = [];

    // Get current metrics
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = Math.round((usedMemory / totalMemory) * 100);

    // CPU check
    let cpuUsage = 0;
    if (cpus.length > 0) {
      const cpu = cpus[0];
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      cpuUsage = Math.round(((total - idle) / total) * 100);
    }

    if (cpuUsage > 80) {
      alerts.push({
        id: `cpu-${Date.now()}`,
        severity: "warning",
        title: "High CPU Usage",
        message: `CPU usage is at ${cpuUsage}%`,
        timestamp: new Date(),
        resolved: false,
      });
    }

    // Memory check
    if (memoryPercent > 85) {
      alerts.push({
        id: `mem-${Date.now()}`,
        severity: "critical",
        title: "Critical Memory Usage",
        message: `Memory usage is at ${memoryPercent}%`,
        timestamp: new Date(),
        resolved: false,
      });
    } else if (memoryPercent > 70) {
      alerts.push({
        id: `mem-${Date.now()}`,
        severity: "warning",
        title: "High Memory Usage",
        message: `Memory usage is at ${memoryPercent}%`,
        timestamp: new Date(),
        resolved: false,
      });
    }

    // Uptime check
    const uptime = Math.round(process.uptime() / 3600); // hours
    if (uptime > 24) {
      alerts.push({
        id: `uptime-${Date.now()}`,
        severity: "info",
        title: "Long Uptime",
        message: `Server has been running for ${uptime} hours. Consider restarting.`,
        timestamp: new Date(),
        resolved: false,
      });
    }

    res.json({
      alerts,
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      warnings: alerts.filter((a) => a.severity === "warning").length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Alerts error:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
};
