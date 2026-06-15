/**
 * Socket.io Events Service
 * Centralized event emission for real-time dashboard updates
 * 
 * Usage:
 * - Import { emitJenkinsBuildStarted } from this service
 * - Call function to emit events to connected clients
 */

let io = null;

// Initialize Socket.io instance (called from server.js)
export const initializeSocketEvents = (socketIOInstance) => {
  io = socketIOInstance;
  console.log("✅ Socket.io events service initialized");
};

/**
 * ===== JENKINS BUILD EVENTS =====
 */

/**
 * Emit when Jenkins build starts
 */
export const emitJenkinsBuildStarted = (buildData) => {
  if (!io) {
    console.warn("⚠️ Socket.io not initialized");
    return;
  }

  const eventData = {
    buildNumber: buildData.buildNumber,
    jobName: buildData.jobName,
    timestamp: new Date(),
    branch: buildData.branch,
    commit: buildData.commit,
    author: buildData.author,
    status: "RUNNING",
  };

  console.log(`📢 [Socket.io] Emitting Jenkins build started: #${buildData.buildNumber}`);
  io.to("jenkins-builds").emit("jenkins:build-started", eventData);
  io.to("jenkins-status").emit("jenkins:status-update", {
    buildNumber: buildData.buildNumber,
    status: "RUNNING",
    timestamp: new Date(),
  });
};

/**
 * Emit when Jenkins build completes (success or failure)
 */
export const emitJenkinsBuildCompleted = (buildData) => {
  if (!io) return;

  const eventData = {
    buildNumber: buildData.buildNumber,
    jobName: buildData.jobName,
    status: buildData.status, // "SUCCESS" or "FAILURE"
    result: buildData.result,
    timestamp: new Date(),
    duration: buildData.duration,
    logSummary: buildData.logSummary,
    artifacts: buildData.artifacts || [],
  };

  console.log(
    `📢 [Socket.io] Emitting Jenkins build completed: #${buildData.buildNumber} - ${buildData.status}`
  );
  io.to("jenkins-builds").emit("jenkins:build-completed", eventData);
  io.to("jenkins-status").emit("jenkins:status-update", {
    buildNumber: buildData.buildNumber,
    status: buildData.status,
    timestamp: new Date(),
  });
};

/**
 * Emit Jenkins build progress (real-time updates)
 */
export const emitJenkinsBuildProgress = (buildData) => {
  if (!io) return;

  const eventData = {
    buildNumber: buildData.buildNumber,
    jobName: buildData.jobName,
    progress: buildData.progress || 0, // 0-100
    currentStage: buildData.currentStage,
    timestamp: new Date(),
  };

  io.to("jenkins-builds").emit("jenkins:build-progress", eventData);
};

/**
 * ===== DEPLOYMENT EVENTS =====
 */

/**
 * Emit when deployment starts
 */
export const emitDeploymentStarted = (deploymentData) => {
  if (!io) return;

  const eventData = {
    deploymentId: deploymentData.deploymentId,
    buildNumber: deploymentData.buildNumber,
    version: deploymentData.version,
    containerName: deploymentData.containerName,
    status: "in-progress",
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting deployment started: ${deploymentData.deploymentId}`);
  io.to("pipeline").emit("deployment:started", eventData);
};

/**
 * Emit deployment progress update
 */
export const emitDeploymentProgress = (deploymentData) => {
  if (!io) return;

  const eventData = {
    deploymentId: deploymentData.deploymentId,
    stage: deploymentData.stage, // "build", "push", "stop-old", "start-new", etc.
    status: deploymentData.status, // "in-progress", "completed"
    message: deploymentData.message,
    progress: deploymentData.progress || 0, // 0-100
    timestamp: new Date(),
  };

  io.to("pipeline").emit("deployment:progress", eventData);
};

/**
 * Emit when deployment succeeds
 */
export const emitDeploymentSucceeded = (deploymentData) => {
  if (!io) return;

  const eventData = {
    deploymentId: deploymentData.deploymentId,
    buildNumber: deploymentData.buildNumber,
    version: deploymentData.version,
    containerName: deploymentData.containerName,
    status: "success",
    duration: deploymentData.duration,
    imageTag: deploymentData.imageTag,
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting deployment succeeded: ${deploymentData.deploymentId}`);
  io.to("pipeline").emit("deployment:succeeded", eventData);
  
  // Also emit to logs room
  io.to("logs").emit("log:new", {
    source: "deployment",
    level: "success",
    message: `Deployment successful: ${deploymentData.version}`,
    timestamp: new Date(),
  });
};

/**
 * Emit when deployment fails
 */
export const emitDeploymentFailed = (deploymentData) => {
  if (!io) return;

  const eventData = {
    deploymentId: deploymentData.deploymentId,
    buildNumber: deploymentData.buildNumber,
    version: deploymentData.version,
    containerName: deploymentData.containerName,
    status: "failed",
    error: deploymentData.error,
    failedStage: deploymentData.failedStage,
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting deployment failed: ${deploymentData.deploymentId}`);
  io.to("pipeline").emit("deployment:failed", eventData);
  
  // Emit as alert too
  io.to("alerts").emit("alert:new", {
    type: "deployment_failure",
    severity: "critical",
    title: "Deployment Failed",
    message: deploymentData.error,
    timestamp: new Date(),
  });
};

/**
 * ===== ALERT EVENTS =====
 */

/**
 * Emit new alert
 */
export const emitNewAlert = (alertData) => {
  if (!io) return;

  const eventData = {
    alertId: alertData._id,
    type: alertData.type,
    severity: alertData.severity, // "info", "warning", "critical"
    title: alertData.title,
    message: alertData.message,
    resourceType: alertData.resourceType,
    resourceId: alertData.resourceId,
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting new alert: ${alertData.type}`);
  io.to("alerts").emit("alert:new", eventData);
  
  // Emit to dashboard as well
  io.to("pipeline").emit("alert:new", eventData);
};

/**
 * Emit alert resolved
 */
export const emitAlertResolved = (alertId) => {
  if (!io) return;

  const eventData = {
    alertId,
    status: "resolved",
    timestamp: new Date(),
  };

  io.to("alerts").emit("alert:resolved", eventData);
};

/**
 * ===== LOG EVENTS =====
 */

/**
 * Emit new log
 */
export const emitNewLog = (logData) => {
  if (!io) return;

  const eventData = {
    logId: logData._id || Date.now(),
    source: logData.source, // "jenkins", "deployment", "docker", "webhook"
    level: logData.logType || "info", // "info", "warning", "error", "success"
    message: logData.message,
    details: logData.details,
    timestamp: new Date(),
  };

  io.to("logs").emit("log:new", eventData);
};

/**
 * Emit log stream (multiple logs at once)
 */
export const emitLogStream = (sourceType, logs) => {
  if (!io) return;

  const eventData = {
    source: sourceType,
    logs: logs.map(log => ({
      message: typeof log === "string" ? log : log.message || JSON.stringify(log),
      timestamp: new Date(),
    })),
  };

  io.to("logs").emit("log:stream", eventData);
};

/**
 * ===== METRICS EVENTS =====
 */

/**
 * Emit metrics update (CPU, memory, etc.)
 */
export const emitMetricsUpdate = (metricsData) => {
  if (!io) return;

  const eventData = {
    timestamp: new Date(),
    cpu: metricsData.cpu,
    memory: metricsData.memory,
    disk: metricsData.disk,
    network: metricsData.network,
    uptime: metricsData.uptime,
  };

  io.to("metrics").emit("metrics:update", eventData);
};

/**
 * Emit metrics snapshot
 */
export const emitMetricsSnapshot = (snapshotData) => {
  if (!io) return;

  const eventData = {
    timestamp: new Date(),
    ...snapshotData,
  };

  io.to("metrics").emit("metrics:snapshot", eventData);
};

/**
 * ===== CONTAINER STATUS EVENTS =====
 */

/**
 * Emit container status change
 */
export const emitContainerStatusChange = (containerData) => {
  if (!io) return;

  const eventData = {
    containerId: containerData.containerId,
    containerName: containerData.containerName,
    status: containerData.status, // "running", "stopped", "crashed"
    image: containerData.image,
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting container status change: ${containerData.containerName} - ${containerData.status}`);
  io.to("docker-monitor").emit("container:status-change", eventData);
};

/**
 * Emit container stats update
 */
export const emitContainerStatsUpdate = (containerData) => {
  if (!io) return;

  const eventData = {
    containerId: containerData.containerId,
    containerName: containerData.containerName,
    cpu: containerData.cpu,
    memory: containerData.memory,
    network: containerData.network,
    timestamp: new Date(),
  };

  io.to("docker-stats").emit("container:stats-update", eventData);
};

/**
 * ===== PIPELINE STATUS EVENTS =====
 */

/**
 * Emit complete pipeline status
 */
export const emitPipelineStatusUpdate = (pipelineData) => {
  if (!io) return;

  const eventData = {
    pipelineId: pipelineData.pipelineId,
    status: pipelineData.status,
    stage: pipelineData.stage,
    progress: pipelineData.progress || 0,
    lastUpdate: new Date(),
    buildNumber: pipelineData.buildNumber,
    deploymentId: pipelineData.deploymentId,
  };

  io.to("pipeline").emit("pipeline:status-update", eventData);
};

/**
 * ===== DOCKER BUILD EVENTS =====
 */

export const emitDockerBuildStarted = (buildData) => {
  if (!io) return;

  const eventData = {
    buildId: buildData.buildId,
    deploymentId: buildData.deploymentId,
    imageTag: buildData.imageTag,
    status: "BUILDING",
    timestamp: new Date(),
  };

  io.to(`build:${buildData.deploymentId}`).emit("build:started", eventData);
  io.to("pipeline").emit("build:started", eventData);
};

export const emitDockerBuildLog = (buildData) => {
  if (!io) return;

  const eventData = {
    buildId: buildData.buildId,
    deploymentId: buildData.deploymentId,
    message: buildData.message,
    timestamp: new Date(),
  };

  io.to(`build:${buildData.deploymentId}`).emit("build:log", eventData);
  io.to("logs").emit("log:new", {
    source: "docker-build",
    level: "info",
    message: buildData.message,
    timestamp: eventData.timestamp,
  });
};

export const emitDockerBuildCompleted = (buildData) => {
  if (!io) return;

  const eventData = {
    buildId: buildData.buildId,
    deploymentId: buildData.deploymentId,
    imageTag: buildData.imageTag,
    status: buildData.status,
    duration: buildData.duration,
    error: buildData.error,
    timestamp: new Date(),
  };

  io.to(`build:${buildData.deploymentId}`).emit("build:completed", eventData);
  io.to("pipeline").emit("build:completed", eventData);
};

/**
 * ===== DOCKER PUSH EVENTS =====
 */

/**
 * Emit when Docker push starts
 */
export const emitDockerPushStarted = (pushData) => {
  if (!io) return;

  const eventData = {
    imageId: pushData.imageId,
    buildId: pushData.buildId,
    sourceImageTag: pushData.sourceImageTag,
    targetImageTag: pushData.targetImageTag,
    status: "PUSHING",
    timestamp: new Date(),
  };

  io.to(`push:${pushData.buildId}`).emit("push:started", eventData);
  io.to("pipeline").emit("push:started", eventData);
};

/**
 * Emit Docker push log messages in real-time
 */
export const emitDockerPushLog = (pushData) => {
  if (!io) return;

  const eventData = {
    imageId: pushData.imageId,
    buildId: pushData.buildId,
    message: pushData.message,
    level: pushData.level || "info",
    timestamp: new Date(),
  };

  io.to(`push:${pushData.buildId}`).emit("push:log", eventData);
  io.to("logs").emit("log:new", {
    source: "docker-push",
    level: pushData.level || "info",
    message: pushData.message,
    timestamp: eventData.timestamp,
  });
};

/**
 * Emit when Docker push completes
 */
export const emitDockerPushCompleted = (pushData) => {
  if (!io) return;

  const eventData = {
    imageId: pushData.imageId,
    buildId: pushData.buildId,
    targetImageTag: pushData.targetImageTag,
    status: pushData.status,
    duration: pushData.duration,
    error: pushData.error,
    dockerHubUrl: pushData.dockerHubUrl,
    timestamp: new Date(),
  };

  io.to(`push:${pushData.buildId}`).emit("push:completed", eventData);
  io.to("pipeline").emit("push:completed", eventData);
};

/**
 * ===== WEBHOOK EVENTS =====
 */

/**
 * Emit webhook received
 */
export const emitWebhookReceived = (webhookData) => {
  if (!io) return;

  const eventData = {
    webhookId: webhookData._id,
    event: webhookData.event,
    repository: webhookData.repository,
    branch: webhookData.branch,
    commit: webhookData.commit,
    timestamp: new Date(),
  };

  console.log(`📢 [Socket.io] Emitting webhook received: ${webhookData.event}`);
  io.to("pipeline").emit("webhook:received", eventData);
};

/**
 * ===== BROADCAST EVENTS =====
 */

/**
 * Broadcast to all connected clients
 */
export const broadcastEvent = (eventName, data) => {
  if (!io) return;

  console.log(`📢 [Socket.io] Broadcasting event: ${eventName}`);
  io.emit(eventName, data);
};

/**
 * Broadcast to specific room
 */
export const broadcastToRoom = (roomName, eventName, data) => {
  if (!io) return;

  console.log(`📢 [Socket.io] Broadcasting to ${roomName}: ${eventName}`);
  io.to(roomName).emit(eventName, data);
};

/**
 * Get number of connected clients
 */
export const getConnectedClientsCount = () => {
  if (!io) return 0;
  return io.engine.clientsCount;
};

/**
 * Get Socket.io instance (for advanced usage)
 */
export const getSocketIOInstance = () => {
  return io;
};

export default {
  initializeSocketEvents,
  // Jenkins events
  emitJenkinsBuildStarted,
  emitJenkinsBuildCompleted,
  emitJenkinsBuildProgress,
  // Deployment events
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
  // Alert events
  emitNewAlert,
  emitAlertResolved,
  // Log events
  emitNewLog,
  emitLogStream,
  // Metrics events
  emitMetricsUpdate,
  emitMetricsSnapshot,
  // Container events
  emitContainerStatusChange,
  emitContainerStatsUpdate,
  // Pipeline events
  emitPipelineStatusUpdate,
  emitDockerBuildStarted,
  emitDockerBuildLog,
  emitDockerBuildCompleted,
  // Docker push events
  emitDockerPushStarted,
  emitDockerPushLog,
  emitDockerPushCompleted,
  // Webhook events
  emitWebhookReceived,
  // Broadcast events
  broadcastEvent,
  broadcastToRoom,
  getConnectedClientsCount,
  getSocketIOInstance,
};
