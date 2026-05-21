import React, { useEffect, useState } from "react";
import { useSocketContext } from "../lib/SocketContext";

/**
 * Real-time Dashboard Component
 * Displays live updates from Socket.io
 */
export const RealtimeDashboard = () => {
  const socket = useSocketContext();
  const [activeTab, setActiveTab] = useState("pipeline");

  useEffect(() => {
    if (!socket?.isConnected) return;

    // Subscribe to all channels on component mount
    socket.subscribe("pipeline");
    socket.subscribe("jenkins-builds");
    socket.subscribe("alerts");
    socket.subscribe("logs");
    socket.subscribe("metrics");
    socket.subscribe("docker-monitor");

    return () => {
      // Unsubscribe when component unmounts
      socket.unsubscribe("pipeline");
      socket.unsubscribe("jenkins-builds");
      socket.unsubscribe("alerts");
      socket.unsubscribe("logs");
      socket.unsubscribe("metrics");
      socket.unsubscribe("docker-monitor");
    };
  }, [socket]);

  if (!socket) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">⚠️ Socket context not available</p>
      </div>
    );
  }

  const connectionStatus = socket.isConnected ? (
    <span className="text-green-600">🟢 Connected</span>
  ) : (
    <span className="text-red-600">🔴 Disconnected</span>
  );

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Real-time Dashboard</h2>
          <div className="text-sm">{connectionStatus}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {["pipeline", "jenkins", "deployment", "alerts", "logs", "metrics", "containers"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Pipeline Tab */}
        {activeTab === "pipeline" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Pipeline Status</h3>
            {socket.data?.pipelineStatus ? (
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <pre className="text-sm overflow-auto max-h-96">
                  {JSON.stringify(socket.data.pipelineStatus, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-gray-500">No pipeline status available</p>
            )}
          </div>
        )}

        {/* Jenkins Tab */}
        {activeTab === "jenkins" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Jenkins Builds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {socket.data?.jenkinsBuildStarted && (
                <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
                  <h4 className="font-semibold text-yellow-900 mb-2">Build Started</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.jenkinsBuildStarted, null, 2)}
                  </pre>
                </div>
              )}
              {socket.data?.jenkinsBuildCompleted && (
                <div className="bg-green-50 p-4 rounded border border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">Build Completed</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.jenkinsBuildCompleted, null, 2)}
                  </pre>
                </div>
              )}
              {socket.data?.jenkinsBuildProgress && (
                <div className="bg-blue-50 p-4 rounded border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Build Progress</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.jenkinsBuildProgress, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deployment Tab */}
        {activeTab === "deployment" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Deployment Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {socket.data?.deploymentStarted && (
                <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
                  <h4 className="font-semibold text-yellow-900 mb-2">Started</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.deploymentStarted, null, 2)}
                  </pre>
                </div>
              )}
              {socket.data?.deploymentProgress && (
                <div className="bg-blue-50 p-4 rounded border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Progress</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.deploymentProgress, null, 2)}
                  </pre>
                </div>
              )}
              {socket.data?.deploymentSucceeded && (
                <div className="bg-green-50 p-4 rounded border border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">Succeeded</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.deploymentSucceeded, null, 2)}
                  </pre>
                </div>
              )}
              {socket.data?.deploymentFailed && (
                <div className="bg-red-50 p-4 rounded border border-red-200">
                  <h4 className="font-semibold text-red-900 mb-2">Failed</h4>
                  <pre className="text-sm overflow-auto max-h-48">
                    {JSON.stringify(socket.data.deploymentFailed, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">
              Alerts ({socket.data?.alerts?.length || 0})
            </h3>
            {socket.data?.alerts && socket.data.alerts.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-auto">
                {socket.data.alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border-l-4 ${
                      alert.severity === "critical"
                        ? "bg-red-50 border-red-500"
                        : alert.severity === "warning"
                        ? "bg-yellow-50 border-yellow-500"
                        : "bg-blue-50 border-blue-500"
                    }`}
                  >
                    <h5 className="font-semibold">{alert.title}</h5>
                    <p className="text-sm text-gray-700">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{alert.type}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No alerts</p>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">
              Recent Logs ({socket.data?.logs?.length || 0})
            </h3>
            {socket.data?.logs && socket.data.logs.length > 0 ? (
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm max-h-96 overflow-auto">
                {socket.data.logs.map((log, idx) => (
                  <div key={idx} className="py-1">
                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {" "} | {" "}
                    <span className={log.level === "error" ? "text-red-400" : ""}>{log.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No logs available</p>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === "metrics" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">System Metrics</h3>
            {socket.data?.metrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {socket.data.metrics.cpu && (
                  <div className="bg-blue-50 p-4 rounded">
                    <p className="text-sm text-gray-600">CPU Usage</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {socket.data.metrics.cpu?.toFixed(1)}%
                    </p>
                  </div>
                )}
                {socket.data.metrics.memory && (
                  <div className="bg-purple-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Memory</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {socket.data.metrics.memory?.toFixed(1)}%
                    </p>
                  </div>
                )}
                {socket.data.metrics.disk && (
                  <div className="bg-orange-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Disk</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {socket.data.metrics.disk?.toFixed(1)}%
                    </p>
                  </div>
                )}
                {socket.data.metrics.uptime && (
                  <div className="bg-green-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Uptime</p>
                    <p className="text-xl font-bold text-green-600">
                      {Math.round(socket.data.metrics.uptime / 3600)}h
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No metrics available</p>
            )}
          </div>
        )}

        {/* Containers Tab */}
        {activeTab === "containers" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">
              Container Status ({socket.data?.containerStatus?.length || 0})
            </h3>
            {socket.data?.containerStatus && socket.data.containerStatus.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-auto">
                {socket.data.containerStatus.map((container, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h5 className="font-semibold">{container.containerName}</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm mt-2 text-gray-600">
                      <p>ID: {container.containerId?.slice(0, 12)}</p>
                      <p>Status: {container.status || "running"}</p>
                      {container.cpu && <p>CPU: {container.cpu?.toFixed(1)}%</p>}
                      {container.memory && <p>Memory: {container.memory?.toFixed(1)}MB</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No container data available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RealtimeDashboard;
