import { useEffect, useState, useCallback, useRef } from "react";
import io from "socket.io-client";

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  autoConnect: false,
};

/**
 * Custom hook for Socket.io connection and events
 * Manages real-time updates from the backend
 */
export const useSocket = (token) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    jenkinsBuildStarted: null,
    jenkinsBuildCompleted: null,
    jenkinsBuildProgress: null,
    deploymentStarted: null,
    deploymentProgress: null,
    deploymentSucceeded: null,
    deploymentFailed: null,
    alerts: [],
    logs: [],
    metrics: null,
    pipelineStatus: null,
    containerStatus: [],
  });

  // Connect to Socket.io server
  useEffect(() => {
    if (!token) {
      console.warn("❌ [Socket] No token provided, cannot connect");
      return;
    }

    console.log("🔌 [Socket] Connecting to server...");

    const socket = io(SOCKET_SERVER_URL, {
      ...SOCKET_OPTIONS,
      auth: {
        token,
      },
    });

    // Connection event
    socket.on("connect", () => {
      console.log("✅ [Socket] Connected:", socket.id);
      setIsConnected(true);
      setError(null);
    });

    // Connection error event
    socket.on("connect_error", (error) => {
      console.error("❌ [Socket] Connection error:", error.message);
      setError(error.message);
    });

    // Disconnection event
    socket.on("disconnect", () => {
      console.log("❌ [Socket] Disconnected");
      setIsConnected(false);
    });

    // === JENKINS BUILD EVENTS ===
    socket.on("jenkins:build-started", (buildData) => {
      console.log("📢 [Socket] Jenkins build started:", buildData);
      setData((prev) => ({
        ...prev,
        jenkinsBuildStarted: buildData,
      }));
    });

    socket.on("jenkins:build-completed", (buildData) => {
      console.log("📢 [Socket] Jenkins build completed:", buildData);
      setData((prev) => ({
        ...prev,
        jenkinsBuildCompleted: buildData,
      }));
    });

    socket.on("jenkins:build-progress", (buildData) => {
      console.log("📢 [Socket] Jenkins build progress:", buildData);
      setData((prev) => ({
        ...prev,
        jenkinsBuildProgress: buildData,
      }));
    });

    socket.on("jenkins:status-update", (statusData) => {
      console.log("📢 [Socket] Jenkins status update:", statusData);
      setData((prev) => ({
        ...prev,
        pipelineStatus: statusData,
      }));
    });

    // === DEPLOYMENT EVENTS ===
    socket.on("deployment:started", (deploymentData) => {
      console.log("📢 [Socket] Deployment started:", deploymentData);
      setData((prev) => ({
        ...prev,
        deploymentStarted: deploymentData,
      }));
    });

    socket.on("deployment:progress", (progressData) => {
      console.log("📢 [Socket] Deployment progress:", progressData);
      setData((prev) => ({
        ...prev,
        deploymentProgress: progressData,
      }));
    });

    socket.on("deployment:succeeded", (deploymentData) => {
      console.log("📢 [Socket] Deployment succeeded:", deploymentData);
      setData((prev) => ({
        ...prev,
        deploymentSucceeded: deploymentData,
      }));
    });

    socket.on("deployment:failed", (deploymentData) => {
      console.log("📢 [Socket] Deployment failed:", deploymentData);
      setData((prev) => ({
        ...prev,
        deploymentFailed: deploymentData,
      }));
    });

    // === ALERT EVENTS ===
    socket.on("alert:new", (alertData) => {
      console.log("📢 [Socket] New alert:", alertData);
      setData((prev) => ({
        ...prev,
        alerts: [alertData, ...(prev.alerts || [])].slice(0, 50), // Keep latest 50
      }));
    });

    socket.on("alert:resolved", (alertData) => {
      console.log("📢 [Socket] Alert resolved:", alertData);
      setData((prev) => ({
        ...prev,
        alerts: (prev.alerts || []).filter((a) => a.alertId !== alertData.alertId),
      }));
    });

    // === LOG EVENTS ===
    socket.on("log:new", (logData) => {
      console.log("📢 [Socket] New log:", logData);
      setData((prev) => ({
        ...prev,
        logs: [logData, ...(prev.logs || [])].slice(0, 100), // Keep latest 100
      }));
    });

    socket.on("log:stream", (logStreamData) => {
      console.log("📢 [Socket] Log stream:", logStreamData);
      setData((prev) => ({
        ...prev,
        logs: [...logStreamData.logs, ...(prev.logs || [])].slice(0, 100),
      }));
    });

    // === METRICS EVENTS ===
    socket.on("metrics:update", (metricsData) => {
      console.log("📢 [Socket] Metrics update:", metricsData);
      setData((prev) => ({
        ...prev,
        metrics: metricsData,
      }));
    });

    socket.on("metrics:snapshot", (snapshotData) => {
      console.log("📢 [Socket] Metrics snapshot:", snapshotData);
      setData((prev) => ({
        ...prev,
        metrics: snapshotData,
      }));
    });

    // === CONTAINER EVENTS ===
    socket.on("container:status-change", (containerData) => {
      console.log("📢 [Socket] Container status change:", containerData);
      setData((prev) => {
        const existing = (prev.containerStatus || []).filter(
          (c) => c.containerId !== containerData.containerId
        );
        return {
          ...prev,
          containerStatus: [containerData, ...existing],
        };
      });
    });

    socket.on("container:stats-update", (statsData) => {
      console.log("📢 [Socket] Container stats update:", statsData);
      setData((prev) => {
        const existing = (prev.containerStatus || []).filter(
          (c) => c.containerId !== statsData.containerId
        );
        return {
          ...prev,
          containerStatus: [statsData, ...existing],
        };
      });
    });

    // === WEBHOOK EVENTS ===
    socket.on("webhook:received", (webhookData) => {
      console.log("📢 [Socket] Webhook received:", webhookData);
      setData((prev) => ({
        ...prev,
        pipelineStatus: {
          status: "webhook-received",
          event: webhookData.event,
          timestamp: new Date(),
        },
      }));
    });

    // === PIPELINE EVENTS ===
    socket.on("pipeline:status-update", (pipelineData) => {
      console.log("📢 [Socket] Pipeline status update:", pipelineData);
      setData((prev) => ({
        ...prev,
        pipelineStatus: pipelineData,
      }));
    });

    socketRef.current = socket;

    // Connect to server
    socket.connect();

    // Cleanup on unmount
    return () => {
      console.log("🔌 [Socket] Disconnecting...");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Subscribe to a channel
  const subscribe = useCallback(
    (channel) => {
      if (!socketRef.current?.connected) {
        console.warn(`⚠️  [Socket] Cannot subscribe to ${channel} - not connected`);
        return;
      }

      console.log(`📡 [Socket] Subscribing to: ${channel}`);
      socketRef.current.emit(`subscribe:${channel}`);
    },
    []
  );

  // Unsubscribe from a channel
  const unsubscribe = useCallback(
    (channel) => {
      if (!socketRef.current?.connected) return;

      console.log(`📡 [Socket] Unsubscribing from: ${channel}`);
      socketRef.current.emit(`unsubscribe:${channel}`);
    },
    []
  );

  // Emit custom event
  const emit = useCallback(
    (eventName, eventData) => {
      if (!socketRef.current?.connected) {
        console.warn(`⚠️  [Socket] Cannot emit ${eventName} - not connected`);
        return;
      }

      console.log(`📤 [Socket] Emitting: ${eventName}`, eventData);
      socketRef.current.emit(eventName, eventData);
    },
    []
  );

  // Request build progress on demand
  const requestBuildProgress = useCallback((buildNumber) => {
    emit("jenkins:request-build-progress", buildNumber);
  }, [emit]);

  // Request container stats on demand
  const requestContainerStats = useCallback((containerId) => {
    emit("docker:request-container-stats", containerId);
  }, [emit]);

  return {
    isConnected,
    error,
    data,
    subscribe,
    unsubscribe,
    emit,
    requestBuildProgress,
    requestContainerStats,
  };
};

export default useSocket;
