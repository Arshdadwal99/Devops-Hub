import { Alert } from "../models/Alert.js";
import { Metrics } from "../models/Metrics.js";
import { emitNewAlert, emitAlertResolved } from "./socketEventsService.js";
import { isDbConnected } from "../db.js";

/**
 * Create or update alert
 */
export const createAlert = async (userId, alertData) => {
  try {
    if (!isDbConnected()) {
      console.warn("⚠️ [Alert] Database not connected - alert will be emitted but not persisted");
      // Still emit the alert via Socket.io
      emitNewAlert({
        type: alertData.type,
        severity: alertData.severity,
        title: alertData.title,
        message: alertData.message,
        resourceType: alertData.resourceType,
        resourceId: alertData.resourceId,
      });
      return {
        success: true,
        alert: alertData,
        persisted: false,
      };
    }

    const alert = await Alert.create({
      userId,
      ...alertData,
      createdAt: new Date(),
    });

    console.log(`🚨 [Alert] ${alertData.severity}: ${alertData.title}`);

    // Emit Socket.io event
    emitNewAlert({
      _id: alert._id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      resourceType: alert.resourceType,
      resourceId: alert.resourceId,
    });

    return {
      success: true,
      alert: alert.toObject(),
      persisted: true,
    };
  } catch (error) {
    if (error.message.includes("buffering timed out")) {
      console.error("❌ [Alert] Database buffer timeout - connection issue with MongoDB");
    } else if (error.message.includes("connect")) {
      console.error("❌ [Alert] Database connection error - cannot save alert");
    } else {
      console.error("❌ [Alert] Error creating alert:", error.message);
    }
    return {
      success: false,
      error: error.message,
      persisted: false,
    };
  }
};

/**
 * Get alerts for user
 */
export const getAlerts = async (userId, filters = {}) => {
  try {
    if (!isDbConnected()) {
      console.warn("⚠️ [Alert] Database not connected - cannot fetch alerts");
      return {
        success: false,
        error: "Database not connected",
        alerts: [],
        total: 0,
      };
    }

    const query = { userId };
    const {
      severity = null,
      resolved = false,
      type = null,
      limit = 50,
      skip = 0,
    } = filters;

    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (!resolved) query.resolved = false;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Alert.countDocuments(query);

    return {
      success: true,
      alerts,
      total,
      count: alerts.length,
    };
  } catch (error) {
    if (error.message.includes("buffering timed out")) {
      console.error("❌ [Alert] Database buffer timeout - connection issue");
    } else {
      console.error("❌ [Alert] Error fetching alerts:", error.message);
    }
    return {
      success: false,
      error: error.message,
      alerts: [],
      total: 0,
    };
  }
};

/**
 * Mark alert as resolved
 */
export const resolveAlert = async (alertId, resolvedBy = null, action = null) => {
  try {
    if (!isDbConnected()) {
      console.warn("⚠️ [Alert] Database not connected - cannot resolve alert");
      return {
        success: false,
        error: "Database not connected",
      };
    }

    const alert = await Alert.findByIdAndUpdate(
      alertId,
      {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        action,
      },
      { new: true }
    );

    if (!alert) {
      throw new Error("Alert not found");
    }

    console.log(`✅ [Alert] Alert resolved: ${alert.title}`);

    // Emit Socket.io event
    emitAlertResolved(alert._id.toString());

    return {
      success: true,
      alert: alert.toObject(),
    };
  } catch (error) {
    if (error.message.includes("buffering timed out")) {
      console.error("❌ [Alert] Database buffer timeout - connection issue");
    } else {
      console.error("❌ [Alert] Error resolving alert:", error.message);
    }
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete alert
 */
export const deleteAlert = async (alertId) => {
  try {
    const result = await Alert.findByIdAndDelete(alertId);

    if (!result) {
      throw new Error("Alert not found");
    }

    console.log(`🗑️ [Alert] Alert deleted`);

    return {
      success: true,
      deletedId: alertId,
    };
  } catch (error) {
    console.error("❌ [Alert] Error deleting alert:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Generate alerts based on metrics
 */
export const generateMetricAlerts = async (userId, metrics) => {
  const alerts = [];

  // Skip alert generation if database is not connected
  if (!isDbConnected()) {
    console.warn("⚠️  Database unavailable - skipping alert generation");
    return { count: 0, alerts: [] };
  }

  try {
    // Check CPU high
    if (metrics.cpu > 85) {
      const existingAlert = await Alert.findOne({
        userId,
        type: "cpu_high",
        resolved: false,
        createdAt: {
          $gte: new Date(Date.now() - 5 * 60000), // Check if alert was created in last 5 mins
        },
      });

      if (!existingAlert) {
        const alert = await createAlert(userId, {
          type: "cpu_high",
          severity: metrics.cpu > 95 ? "critical" : "warning",
          title: `High CPU Usage: ${metrics.cpu.toFixed(1)}%`,
          message: `CPU usage has exceeded safe threshold at ${metrics.cpu.toFixed(1)}%. Investigate running processes.`,
          resourceType: "system",
          metadata: {
            cpu: metrics.cpu,
            threshold: 85,
          },
        });
        if (alert.success) alerts.push(alert.alert);
      }
    }

    // Check Memory high
    if (metrics.memory > 85) {
      const existingAlert = await Alert.findOne({
        userId,
        type: "memory_high",
        resolved: false,
        createdAt: {
          $gte: new Date(Date.now() - 5 * 60000),
        },
      });

      if (!existingAlert) {
        const alert = await createAlert(userId, {
          type: "memory_high",
          severity: metrics.memory > 95 ? "critical" : "warning",
          title: `High Memory Usage: ${metrics.memory.toFixed(1)}%`,
          message: `Memory usage has exceeded safe threshold at ${metrics.memory.toFixed(1)}%. Consider freeing up resources.`,
          resourceType: "system",
          metadata: {
            memory: metrics.memory,
            threshold: 85,
          },
        });
        if (alert.success) alerts.push(alert.alert);
      }
    }

    // Check Disk high
    if (metrics.disk > 90) {
      const existingAlert = await Alert.findOne({
        userId,
        type: "custom",
        resolved: false,
        title: { $regex: "Disk" },
        createdAt: {
          $gte: new Date(Date.now() - 5 * 60000),
        },
      });

      if (!existingAlert) {
        const alert = await createAlert(userId, {
          type: "custom",
          severity: "critical",
          title: `Critical Disk Usage: ${metrics.disk.toFixed(1)}%`,
          message: `Disk usage is at ${metrics.disk.toFixed(1)}%. Free up space immediately to avoid service interruption.`,
          resourceType: "system",
          metadata: {
            disk: metrics.disk,
            threshold: 90,
          },
        });
        if (alert.success) alerts.push(alert.alert);
      }
    }

    // Check container health
    if (metrics.containerHealth && metrics.containerHealth.failed > 0) {
      const existingAlert = await Alert.findOne({
        userId,
        type: "container_stopped",
        resolved: false,
        createdAt: {
          $gte: new Date(Date.now() - 5 * 60000),
        },
      });

      if (!existingAlert) {
        const alert = await createAlert(userId, {
          type: "container_stopped",
          severity: "critical",
          title: `${metrics.containerHealth.failed} Container(s) Failed`,
          message: `${metrics.containerHealth.failed} container(s) have exited with error. Check logs for details.`,
          resourceType: "container",
          metadata: {
            failed: metrics.containerHealth.failed,
          },
        });
        if (alert.success) alerts.push(alert.alert);
      }
    }

    return {
      success: true,
      alerts,
      count: alerts.length,
    };
  } catch (error) {
    console.error("❌ [Alert] Error generating alerts:", error.message);
    return {
      success: false,
      error: error.message,
      alerts: [],
    };
  }
};

/**
 * Clean up old resolved alerts (older than 30 days)
 */
export const cleanupOldAlerts = async () => {
  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await Alert.deleteMany({
      resolved: true,
      resolvedAt: { $lt: cutoffDate },
    });

    console.log(`🧹 [Alert] Cleaned up ${result.deletedCount} old alerts`);

    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    console.error("❌ [Alert] Error cleaning up alerts:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get alert statistics
 */
export const getAlertStats = async (userId) => {
  try {
    const stats = await Alert.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
          },
          warning: {
            $sum: { $cond: [{ $eq: ["$severity", "warning"] }, 1, 0] },
          },
          info: { $sum: { $cond: [{ $eq: ["$severity", "info"] }, 1, 0] } },
          unresolved: {
            $sum: { $cond: [{ $eq: ["$resolved", false] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      total: 0,
      critical: 0,
      warning: 0,
      info: 0,
      unresolved: 0,
    };

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error("❌ [Alert] Error getting stats:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};
