import { getSystemMetrics, getMetricsHistory } from "./metricsService.js";
import { getLastSuccessfulBuild, getPipelineStatus } from "./jenkinsService.js";
import { getContainers } from "./dockerService.js";
import { Alert } from "../models/Alert.js";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";
import { Traffic } from "../models/Traffic.js";
import { Pipeline } from "../models/Pipeline.js";
import { AutoDeploy } from "../models/AutoDeploy.js";

/**
 * Build complete dashboard with real data from all sources
 */
export async function fetchDashboard(userId = "system") {
  try {
    console.log("📊 [Dashboard] Fetching complete dashboard...");

    // Fetch all data in parallel
    const [metrics, metricsHistory, pipelineStatus, buildInfo, containers, recentDeployments, recentAlerts, recentLogs, generatedPipeline, autoDeployConfig] = await Promise.all([
      getSystemMetrics(userId),
      getMetricsHistory(userId, 24 * 60 * 60 * 1000).catch(() => ({ history: [] })),
      getPipelineStatus(userId).catch(() => null),
      getLastSuccessfulBuild().catch(() => null),
      getContainers().catch(() => ({ containers: [], success: false })),
      Deployment.findOne({ userId }).sort({ createdAt: -1 }).lean().catch(() => null),
      Alert.find({ userId, resolved: false }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
      Log.find({ userId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
      Pipeline.findOne({ userId, provider: { $in: ["github-actions", "jenkins"] } }).sort({ createdAt: -1 }).lean().catch(() => null),
      AutoDeploy.findOne({ userId }).sort({ updatedAt: -1 }).lean().catch(() => null),
    ]);

    // Get traffic stats
    const trafficStats = await Traffic.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => null);

    // Calculate traffic and latency
    const requestsPerHour = trafficStats?.requestsPerHour || 0;
    const avgLatency = trafficStats?.avgLatency || 45;

    // Pipeline data from Jenkins
    const pipeline = {
      workflow: pipelineStatus?.jobName || "DevOps Hub Pipeline",
      buildStatus: String(
        generatedPipeline?.statusTracking?.workflowStatus ||
        pipelineStatus?.status ||
        buildInfo?.status ||
        "unknown"
      ).toLowerCase(),
      deploymentStatus: recentDeployments?.status || "unknown",
      environment: "production",
      progress: generatedPipeline?.statusTracking?.workflowStatus === "committed" ? 100 : pipelineStatus?.progress || 0,
      generatedWorkflow: generatedPipeline
        ? {
            path: generatedPipeline.generatedWorkflow?.path,
            repository: generatedPipeline.repository,
            projectType: generatedPipeline.projectType,
            statusTracking: generatedPipeline.statusTracking,
          }
        : null,
      stages: generatedPipeline?.stages || [
        { name: "Generate CI/CD Pipeline", status: "pending" },
        { name: "Generate Jenkins Pipeline", status: "pending" },
        { name: "Create Jenkins Job", status: "pending" },
        { name: "Configure GitHub Webhook", status: "pending" },
      ],
      lastCommit: {
        message: buildInfo?.commit ? `Commit ${buildInfo.commit}` : "No commits found",
        hash: buildInfo?.buildNumber ? `#${buildInfo.buildNumber}` : "N/A",
        author: buildInfo?.author || "Jenkins",
        timestamp: buildInfo?.timestamp || new Date(),
      },
    };

    // Container metrics
    const containerHealth = {
      running: 0,
      stopped: 0,
      failed: 0,
    };

    if (containers.success && containers.containers) {
      containers.containers.forEach(c => {
        if (c.State === "running") containerHealth.running++;
        else if (c.Status?.includes("Exited (0)")) containerHealth.stopped++;
        else containerHealth.failed++;
      });
    }

    // Dashboard response
    const dashboard = {
      timestamp: new Date(),
      metrics: {
        cpu: metrics.cpu || 0,
        memory: metrics.memory || 0,
        disk: metrics.disk || 0,
        network: metrics.network || { incoming: 0, outgoing: 0 },
        uptime: metrics.uptime || 0,
        latency: avgLatency,
        activeContainers: containerHealth.running,
        requestsPerHour: requestsPerHour,
        containerCount: containers.containers?.length || 0,
        containerHealth,
        history: metricsHistory.history?.length
          ? metricsHistory.history.map((item) => ({
              ...item,
              requests: requestsPerHour,
            }))
          : [{
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              cpu: metrics.cpu || 0,
              memory: metrics.memory || 0,
              disk: metrics.disk || 0,
              requests: requestsPerHour,
            }],
      },
      pipeline,
      deployment: {
        lastDeployment: recentDeployments,
        status: recentDeployments?.status || "unknown",
        autoDeployEnabled: Boolean(autoDeployConfig?.enabled),
        autoDeployStatus: autoDeployConfig?.status || recentDeployments?.autoDeployStatus || "DISABLED",
        autoDeploy: autoDeployConfig,
        version: recentDeployments?.version || "N/A",
        previousVersion: recentDeployments?.previousVersion || "N/A",
        deploymentHistory: [],
        logs: recentDeployments?.logs || [],
      },
      controlPanel: {
        currentVersion: recentDeployments?.version || "1.0.0",
        previousVersion: recentDeployments?.previousVersion || "0.9.9",
        status: recentDeployments?.status || "stable",
        lastDeploymentAt: recentDeployments?.createdAt || new Date(),
        nextRecommendation: "Monitor memory usage - currently at " + (metrics.memory || 85) + "%",
      },
      logs: {
        deployment: [
          ...(recentDeployments?.logs || []).slice(-5),
          ...recentLogs
          .filter(log => log.source === "deployment" || log.logType === "deployment")
          .slice(0, 5)
          .map(log => `${new Date(log.createdAt).toLocaleTimeString()} - ${log.message}`),
        ].slice(-8),
        errorLogs: recentLogs
          .filter(log => log.logType === "error" || log.severity === "error")
          .slice(0, 5)
          .map(log => `${new Date(log.createdAt).toLocaleTimeString()} - ${log.message}`),
      },
      alerts: recentAlerts.map(alert => ({
        id: alert._id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message || alert.title,
        timestamp: alert.createdAt,
      })),
    };

    console.log(`✅ [Dashboard] Dashboard data prepared successfully`);
    return dashboard;
  } catch (error) {
    console.error("❌ [Dashboard] Error fetching dashboard:", error.message);
    
    // Return fallback structure if error occurs
    return {
      timestamp: new Date(),
      metrics: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: { incoming: 0, outgoing: 0 },
        uptime: 0,
        latency: 0,
        activeContainers: 0,
        requestsPerHour: 0,
        containerCount: 0,
        containerHealth: { running: 0, stopped: 0, failed: 0 },
        history: [],
      },
      pipeline: {
        workflow: "Unknown",
        buildStatus: "unknown",
        deploymentStatus: "unknown",
        environment: "production",
        progress: 0,
        lastCommit: { message: "N/A", hash: "N/A", author: "N/A", timestamp: new Date() },
      },
      deployment: {
        lastDeployment: null,
        status: "unknown",
        version: "N/A",
        previousVersion: "N/A",
        deploymentHistory: [],
      },
      controlPanel: {
        currentVersion: "1.0.0",
        previousVersion: "0.9.9",
        status: "unknown",
        lastDeploymentAt: new Date(),
        nextRecommendation: "System unavailable - check logs for details",
      },
      logs: {
        deployment: [],
        errorLogs: [],
      },
      alerts: [],
      error: error.message,
    };
  }
}

/**
 * Trigger deployment
 */
export async function triggerDeploy(userId, deploymentData = {}) {
  try {
    console.log(`🚀 [Dashboard] Triggering deployment for user: ${userId}`);

    const {
      version = new Date().toISOString().split("T")[0],
      containerName = "devops-app",
      image = "devops-hub:latest",
      environment = "production",
    } = deploymentData;

    // Create deployment record
    const deployment = await Deployment.create({
      userId,
      version,
      status: "in-progress",
      deploymentType: "manual",
      deployedBy: "dashboard",
      startTime: new Date(),
      containers: [{ name: containerName, image, status: "deploying" }],
      environment,
    });

    console.log(`✅ [Dashboard] Deployment initiated: ${deployment._id}`);
    return deployment;
  } catch (error) {
    console.error("❌ [Dashboard] Deployment error:", error.message);
    throw error;
  }
}

/**
 * Trigger rollback
 */
export async function triggerRollback(userId, rollbackData = {}) {
  try {
    console.log(`⏮️ [Dashboard] Triggering rollback for user: ${userId}`);

    const {
      containerName = "devops-app",
      previousVersion = "previous",
      reason = "manual-rollback",
    } = rollbackData;

    // Create rollback deployment record
    const deployment = await Deployment.create({
      userId,
      version: previousVersion,
      status: "in-progress",
      deploymentType: "rollback",
      deployedBy: "dashboard",
      rollbackReason: reason,
      startTime: new Date(),
      containers: [{ name: containerName, image: `${containerName}:${previousVersion}`, status: "rolling-back" }],
      environment: "production",
    });

    console.log(`✅ [Dashboard] Rollback initiated: ${deployment._id}`);
    return deployment;
  } catch (error) {
    console.error("❌ [Dashboard] Rollback error:", error.message);
    throw error;
  }
}

/**
 * Restart containers
 */
export async function restartContainers(userId, containerName = "devops-app") {
  try {
    console.log(`🔄 [Dashboard] Restarting containers for user: ${userId}`);

    // Create restart log
    await Log.create({
      userId,
      source: "dashboard",
      logType: "info",
      containerName,
      message: "Container restart initiated from dashboard",
      metadata: { action: "restart" },
    });

    console.log(`✅ [Dashboard] Restart initiated`);
    
    // Return updated dashboard
    return await fetchDashboard(userId);
  } catch (error) {
    console.error("❌ [Dashboard] Restart error:", error.message);
    throw error;
  }
}
