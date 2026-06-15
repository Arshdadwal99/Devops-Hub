import { useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "../lib/api";

export default function MonitoringDashboard() {
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Fetch all monitoring data
  const fetchMonitoringData = useCallback(async () => {
    try {
      setError(null);

      // Fetch pipeline status
      try {
        const pipelineData = await api("/monitoring/pipeline-status", {
          method: "GET",
        });
        setPipelineStatus(pipelineData);
      } catch (err) {
        console.warn("Pipeline status fetch failed:", err.message);
        setPipelineStatus(null);
      }

      // Fetch logs
      try {
        const logsData = await api("/monitoring/logs", { method: "GET" });
        setLogs(logsData.logs || logsData.fallback || []);
      } catch (err) {
        console.warn("Logs fetch failed:", err.message);
        setLogs([]);
      }

      // Fetch metrics
      try {
        const metricsData = await api("/monitoring/metrics", {
          method: "GET",
        });
        setMetrics(metricsData);
      } catch (err) {
        console.warn("Metrics fetch failed:", err.message);
        setMetrics(null);
      }

      // Fetch alerts
      try {
        const alertsData = await api("/monitoring/alerts", {
          method: "GET",
        });
        setAlerts(alertsData.alerts || []);
      } catch (err) {
        console.warn("Alerts fetch failed:", err.message);
        setAlerts([]);
      }

      setLoading(false);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Monitoring fetch error:", err);
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const initialLoad = setTimeout(fetchMonitoringData, 0);
    const interval = setInterval(fetchMonitoringData, 10000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [fetchMonitoringData]);

  if (loading && !pipelineStatus && !metrics && !logs.length) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-500">Loading monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Real-Time Monitoring
        </h1>
        <div className="text-sm text-gray-500">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"
        >
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </motion.div>
      )}

      {/* Pipeline Status */}
      {pipelineStatus && <PipelineStatus data={pipelineStatus} />}

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CPUMetric data={metrics.cpu} />
          <MemoryMetric data={metrics.memory} />
          <UptimeMetric uptime={metrics.uptime} />
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Logs Viewer */}
      {logs.length > 0 && <LogsViewer logs={logs} />}

      {/* Auto Refresh Indicator */}
      <div className="fixed bottom-4 right-4 text-xs text-gray-500">
        Auto-refreshing every 10 seconds
      </div>
    </div>
  );
}

/**
 * Pipeline Status Component
 */
function PipelineStatus({ data }) {
  const statusColor =
    data.conclusion === "success"
      ? "bg-green-100 border-green-300 text-green-800"
      : data.conclusion === "failure"
        ? "bg-red-100 border-red-300 text-red-800"
        : "bg-yellow-100 border-yellow-300 text-yellow-800";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg p-6 border-2 ${statusColor}`}
    >
      <h2 className="text-xl font-bold mb-3">GitHub Pipeline Status</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm opacity-75">Workflow</p>
          <p className="font-semibold">{data.workflow_name}</p>
        </div>
        <div>
          <p className="text-sm opacity-75">Status</p>
          <p className="font-semibold capitalize">
            {data.status} - {data.conclusion || "in progress"}
          </p>
        </div>
        <div>
          <p className="text-sm opacity-75">Branch</p>
          <p className="font-semibold">{data.branch || "N/A"}</p>
        </div>
        <div>
          <p className="text-sm opacity-75">Last Commit</p>
          <p className="font-semibold truncate">{data.last_commit}</p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * CPU Metric Component
 */
function CPUMetric({ data }) {
  const usage = data.usage || 0;
  const color = usage > 80 ? "text-red-600" : usage > 50 ? "text-yellow-600" : "text-green-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"
    >
      <h3 className="text-gray-600 font-semibold mb-2">CPU Usage</h3>
      <p className={`text-3xl font-bold ${color}`}>{usage}%</p>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
        <div
          className={`h-full rounded-full transition-all ${
            usage > 80 ? "bg-red-500" : usage > 50 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${usage}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {data.cores} cores • Load: {data.load[0].toFixed(2)}
      </p>
    </motion.div>
  );
}

/**
 * Memory Metric Component
 */
function MemoryMetric({ data }) {
  const percent = data.percent || 0;
  const color =
    percent > 85 ? "text-red-600" : percent > 70 ? "text-yellow-600" : "text-green-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500"
    >
      <h3 className="text-gray-600 font-semibold mb-2">Memory Usage</h3>
      <p className={`text-3xl font-bold ${color}`}>{percent}%</p>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
        <div
          className={`h-full rounded-full transition-all ${
            percent > 85 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {data.used}MB / {data.total}MB
      </p>
    </motion.div>
  );
}

/**
 * Uptime Component
 */
function UptimeMetric({ uptime }) {
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500"
    >
      <h3 className="text-gray-600 font-semibold mb-2">Server Uptime</h3>
      <p className="text-3xl font-bold text-green-600">
        {hours}h {minutes}m
      </p>
      <p className="text-xs text-gray-500 mt-2">
        {uptime} seconds total
      </p>
    </motion.div>
  );
}

/**
 * Alerts Panel
 */
function AlertsPanel({ alerts }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white rounded-lg shadow p-6"
    >
      <h2 className="text-xl font-bold text-gray-900 mb-4">Active Alerts</h2>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`p-4 rounded-lg border-l-4 ${
              alert.severity === "critical"
                ? "bg-red-50 border-red-500 text-red-800"
                : alert.severity === "warning"
                  ? "bg-yellow-50 border-yellow-500 text-yellow-800"
                  : "bg-blue-50 border-blue-500 text-blue-800"
            }`}
          >
            <p className="font-semibold">{alert.title}</p>
            <p className="text-sm mt-1">{alert.message}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Logs Viewer
 */
function LogsViewer({ logs }) {
  const [expandedLogs, setExpandedLogs] = useState(false);
  const safeLogs = Array.isArray(logs) ? logs : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white rounded-lg shadow p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Recent Logs</h2>
        <button
          onClick={() => setExpandedLogs(!expandedLogs)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expandedLogs ? "Collapse" : "Expand"}
        </button>
      </div>

      <div
        className={`bg-gray-900 text-gray-100 p-4 rounded font-mono text-xs space-y-1 overflow-auto ${
          expandedLogs ? "max-h-96" : "max-h-48"
        }`}
      >
        {safeLogs.slice(0, expandedLogs ? safeLogs.length : 10).map((log, idx) => {
          const isObject = log && typeof log === "object";
          const message = isObject ? log.message || JSON.stringify(log) : String(log);
          const type = isObject ? log.type || log.level : "";

          return (
          <div
            key={idx}
            className={`${type === "error" ? "text-red-400" : "text-gray-300"}`}
          >
            <span className="text-gray-500">[{idx + 1}]</span> {message}
          </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Showing {Math.min(expandedLogs ? safeLogs.length : 10, safeLogs.length)} of{" "}
        {safeLogs.length} logs
      </p>
    </motion.div>
  );
}
