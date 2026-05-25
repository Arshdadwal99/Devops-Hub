import si from "systeminformation";
import { Metrics } from "../models/Metrics.js";
import { getContainers, getDockerInfo } from "./dockerService.js";
import { isDbConnected } from "../db.js";

let lastMetrics = null;
let metricsCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

/**
 * Get current system metrics
 */
export const getSystemMetrics = async (userId) => {
  try {
    const now = Date.now();
    
    // Return cached metrics if still fresh
    if (metricsCache && now - lastCacheTime < CACHE_DURATION) {
      metricsCache.fromCache = true;
      return metricsCache;
    }

    console.log("📊 [Metrics] Gathering system metrics...");

    // Gather all metrics in parallel
    const [
      cpuData,
      memData,
      diskData,
      networkData,
      osInfo,
      processes,
      dockerInfo,
    ] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.disksIO(),
      si.networkStats(),
      si.osInfo(),
      si.processes().catch(() => ({ all: 0, running: 0 })),
      getDockerInfo().catch(() => ({ info: null })),
    ]);

    // Calculate CPU percentage
    const cpuPercent = Math.round(cpuData.currentLoad * 100) / 100;

    // Calculate memory percentage
    const memPercent =
      Math.round(((memData.used / memData.total) * 100) * 100) / 100;

    // Calculate disk usage
    const diskPercent = diskData && diskData.length > 0
      ? Math.round((diskData.reduce((sum, d) => sum + d.writeCount, 0) / 1000000) * 100) / 100
      : 0;

    // Calculate network stats (convert bytes to Mbps)
    const networkInOut = networkData && networkData.length > 0 ? {
      incoming: networkData.reduce((sum, d) => sum + d.rx_sec, 0),
      outgoing: networkData.reduce((sum, d) => sum + d.tx_sec, 0),
    } : { incoming: 0, outgoing: 0 };

    // Get container stats
    let containerHealth = {
      running: 0,
      stopped: 0,
      failed: 0,
    };

    const containersResult = await getContainers();
    if (containersResult.success && containersResult.containers) {
      containersResult.containers.forEach(container => {
        if (container.State === "running") {
          containerHealth.running++;
        } else if (container.State === "exited") {
          if (container.Status?.includes("Exited (0)")) {
            containerHealth.stopped++;
          } else {
            containerHealth.failed++;
          }
        }
      });
    }

    const metrics = {
      userId,
      timestamp: new Date(),
      cpu: cpuPercent,
      memory: memPercent,
      disk: diskPercent,
      network: networkInOut,
      uptime: Math.round(osInfo.uptime || 0),
      latency: 0, // Will be measured per API
      activeConnections: processes?.running || 0,
      requestsPerSecond: 0, // Will be calculated from traffic
      containerCount: containersResult.containers?.length || 0,
      containerHealth,
      systemLoad: {
        load1: cpuData.avgLoad || 0,
        load5: cpuData.avgLoad || 0,
        load15: cpuData.avgLoad || 0,
      },
      fromCache: false,
    };

    lastMetrics = metrics;
    metricsCache = metrics;
    lastCacheTime = now;

    // Save to database asynchronously with proper error handling
    if (userId && isDbConnected()) {
      try {
        const saved = await Metrics.create({
          userId,
          cpu: cpuPercent,
          memory: memPercent,
          disk: diskPercent,
          network: networkInOut,
          uptime: Math.round(osInfo.uptime || 0),
          latency: 0,
          activeConnections: processes?.running || 0,
          containerCount: containersResult.containers?.length || 0,
          containerHealth,
          systemLoad: {
            load1: cpuData.avgLoad || 0,
            load5: cpuData.avgLoad || 0,
            load15: cpuData.avgLoad || 0,
          },
          timestamp: new Date(),
        });
        console.log(`💾 [Metrics] Saved to database (ID: ${saved._id})`);
      } catch (err) {
        if (err.message.includes("buffering timed out")) {
          console.warn("⚠️ [Metrics] Database buffer timeout - connection issue");
        } else if (err.message.includes("connect")) {
          console.warn("⚠️ [Metrics] Failed to save - database not connected");
        } else {
          console.warn(`⚠️ [Metrics] Failed to save: ${err.message}`);
        }
        // Metrics are still returned even if save fails
      }
    } else if (userId && !isDbConnected()) {
      console.warn("⚠️  Database unavailable - skipping metrics save to database");
    }

    console.log(`✅ [Metrics] CPU: ${cpuPercent}%, Memory: ${memPercent}%, Containers: ${containerHealth.running}/${containerHealth.running + containerHealth.stopped + containerHealth.failed}`);

    return metrics;
  } catch (error) {
    console.error("❌ [Metrics] Error gathering metrics:", error.message);
    
    // Return last known metrics if available
    if (lastMetrics) {
      return {
        ...lastMetrics,
        error: error.message,
        fromCache: true,
      };
    }

    return {
      userId,
      timestamp: new Date(),
      cpu: 0,
      memory: 0,
      disk: 0,
      network: { incoming: 0, outgoing: 0 },
      uptime: 0,
      latency: 0,
      activeConnections: 0,
      requestsPerSecond: 0,
      containerCount: 0,
      containerHealth: { running: 0, stopped: 0, failed: 0 },
      systemLoad: { load1: 0, load5: 0, load15: 0 },
      error: error.message,
      fromCache: false,
    };
  }
};

/**
 * Get metrics history from database
 */
export const getMetricsHistory = async (userId, duration = 3600000) => {
  try {
    const since = new Date(Date.now() - duration);

    const metrics = await Metrics.find({
      userId,
      timestamp: { $gte: since },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Aggregate data into hourly buckets
    const hourlyData = {};

    metrics.forEach(m => {
      const hour = new Date(m.timestamp);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();

      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = {
          timestamp: hour,
          cpuReadings: [],
          memoryReadings: [],
          diskReadings: [],
          containerCounts: [],
          uptime: m.uptime,
        };
      }

      hourlyData[hourKey].cpuReadings.push(m.cpu);
      hourlyData[hourKey].memoryReadings.push(m.memory);
      hourlyData[hourKey].diskReadings.push(m.disk);
      hourlyData[hourKey].containerCounts.push(m.containerCount);
    });

    const history = Object.values(hourlyData).map(h => ({
      time: h.timestamp.toISOString().substr(11, 5),
      cpu: Math.round(h.cpuReadings.reduce((a, b) => a + b, 0) / h.cpuReadings.length),
      memory: Math.round(h.memoryReadings.reduce((a, b) => a + b, 0) / h.memoryReadings.length),
      disk: Math.round(h.diskReadings.reduce((a, b) => a + b, 0) / h.diskReadings.length),
      containers: Math.round(h.containerCounts.reduce((a, b) => a + b, 0) / h.containerCounts.length),
    }));

    return {
      success: true,
      history,
      count: metrics.length,
    };
  } catch (error) {
    console.error("❌ [Metrics] Error fetching history:", error.message);
    return {
      success: false,
      error: error.message,
      history: [],
    };
  }
};

/**
 * Check if metrics exceed thresholds
 */
export const checkMetricsThresholds = async (metrics, thresholds = {}) => {
  const defaults = {
    cpuHigh: 80,
    memoryHigh: 85,
    diskHigh: 90,
  };

  const limits = { ...defaults, ...thresholds };
  const alerts = [];

  if (metrics.cpu > limits.cpuHigh) {
    alerts.push({
      type: "cpu_high",
      severity: "warning",
      message: `CPU usage is at ${metrics.cpu}% (threshold: ${limits.cpuHigh}%)`,
    });
  }

  if (metrics.memory > limits.memoryHigh) {
    alerts.push({
      type: "memory_high",
      severity: "warning",
      message: `Memory usage is at ${metrics.memory}% (threshold: ${limits.memoryHigh}%)`,
    });
  }

  if (metrics.disk > limits.diskHigh) {
    alerts.push({
      type: "disk_high",
      severity: "critical",
      message: `Disk usage is at ${metrics.disk}% (threshold: ${limits.diskHigh}%)`,
    });
  }

  return alerts;
};

/**
 * Clear metrics cache
 */
export const clearMetricsCache = () => {
  metricsCache = null;
  lastCacheTime = 0;
};
