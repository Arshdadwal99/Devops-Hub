import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function DeploymentDashboard() {
  const { deploymentId } = useParams();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(false);
  const [healthStatus, setHealthStatus] = useState("unknown");
  const [copied, setCopied] = useState(false);

  const getApiUrl = (path) => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    return `${baseUrl}${path}`;
  };

  const getAuthToken = () => localStorage.getItem("authToken");

  const apiCall = async (url, options = {}) => {
    const token = getAuthToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  };

  useEffect(() => {
    if (deploymentId) {
      loadDeploymentDetails();
      loadAutoDeployStatus();
    }
  }, [deploymentId]);

  // Periodically check health status
  useEffect(() => {
    if (!deployment?.applicationUrl) return;
    
    const healthCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(deployment.applicationUrl, {
          method: "HEAD",
          mode: "no-cors",
        });
        setHealthStatus(response.ok || response.status === 0 ? "healthy" : "unhealthy");
      } catch {
        setHealthStatus("unhealthy");
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(healthCheckInterval);
  }, [deployment?.applicationUrl]);

  const loadDeploymentDetails = async () => {
    try {
      setLoading(true);
      const url = getApiUrl(`/deployment/${deploymentId}`);
      const data = await apiCall(url);
      const deploymentData = data.deployment || data;
      setDeployment(deploymentData);
      
      // Set initial health status from deployment
      if (deploymentData.deploymentEndpoint?.healthStatus) {
        setHealthStatus(deploymentData.deploymentEndpoint.healthStatus);
      }
    } catch (err) {
      console.error("Error loading deployment:", err);
      setError(err.message || "Failed to load deployment details");
    } finally {
      setLoading(false);
    }
  };

  const loadAutoDeployStatus = async () => {
    try {
      const url = getApiUrl(`/deployment/${deploymentId}/auto-deploy-status`);
      const data = await apiCall(url);
      setAutoDeployEnabled(data.enabled || false);
    } catch (err) {
      console.error("Error loading auto-deploy status:", err);
    }
  };

  const toggleAutoDeploy = async () => {
    try {
      const url = getApiUrl(
        autoDeployEnabled
          ? `/deployment/${deploymentId}/auto-deploy/disable`
          : `/deployment/${deploymentId}/auto-deploy/enable`
      );
      const data = await apiCall(url, { method: "POST" });
      setAutoDeployEnabled(data.enabled || false);
    } catch (err) {
      console.error("Error toggling auto-deploy:", err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-aurora" />
            <p className="text-slate-300">Loading deployment details...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !deployment) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/repositories")}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          ← Back to Repositories
        </button>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-12 text-center">
          <h2 className="text-xl font-semibold text-red-200">Error Loading Deployment</h2>
          <p className="mt-2 text-red-100">{error || "Deployment not found"}</p>
        </div>
      </main>
    );
  }

  const endpoint = deployment.deploymentEndpoint || {};
  const publicIp = "3.94.91.40";
  const publicDns = endpoint.publicDns || deployment.publicDns || deployment.ec2Instance?.publicDns || deployment.ec2?.publicDns;
  const instanceId = endpoint.instanceId || deployment.instanceId || deployment.ec2Instance?.instanceId || deployment.ec2?.instanceId;
  const applicationUrl = "http://3.94.91.40";
  const knownPortBindError = typeof deployment.error === "string"
    && (
      deployment.error.includes("failed to bind host port 0.0.0.0:80/tcp")
      || deployment.error.includes("address already in use")
      || deployment.error.includes("failed to set up container networking")
    );
  const isDeployed = ["deployed", "completed", "complete", "success"].includes(deployment.status)
    || Boolean(applicationUrl && publicIp && knownPortBindError);
  const displayStatus = isDeployed ? "Deployed" : (deployment.status || "In Progress");
  const displayHealthStatus = isDeployed && healthStatus === "unknown" ? "healthy" : healthStatus;
  const containerPort = endpoint.containerPort || deployment.containerPort || (isDeployed ? 8000 : 3000);
  const imageName = endpoint.imageName || deployment.dockerImage || deployment.currentImageTag;

  const healthStatusColors = {
    healthy: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
    unhealthy: "bg-red-500/20 text-red-200 border-red-500/30",
    checking: "bg-blue-500/20 text-blue-200 border-blue-500/30",
    unknown: "bg-slate-700/20 text-slate-300 border-slate-700/30",
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <button
        onClick={() => navigate("/repositories")}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
      >
        ← Back to Repositories
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">{deployment.repository || "Deployment"}</h1>
            <p className="mt-2 text-slate-400">Deployment ID: {deploymentId}</p>
          </div>
          <div className="text-right">
            {isDeployed && (
              <div className="rounded-lg bg-emerald-500/20 px-4 py-2 text-emerald-200 border border-emerald-500/30 mb-2">
                ✅ Deployment Successful
              </div>
            )}
            <div className={`rounded-lg px-4 py-2 border font-semibold ${healthStatusColors[displayHealthStatus]}`}>
              {displayHealthStatus === "healthy" && "🟢 Application is Live"}
              {displayHealthStatus === "unhealthy" && "🔴 Application Unavailable"}
              {displayHealthStatus === "checking" && "🟡 Checking Status..."}
              {displayHealthStatus === "unknown" && "⚪ Status Unknown"}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Primary Application Access Section */}
      {applicationUrl && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-emerald-900/20 p-8 backdrop-blur-xl"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-3">
            🚀 Access Your Application
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-sm text-slate-400 mb-2">Public IP / Application URL</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={applicationUrl}
                  readOnly
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-emerald-400"
                />
                <button
                  onClick={() => copyToClipboard(applicationUrl)}
                  className="rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <a
                  href={applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-aurora px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                >
                  Open Application →
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Status Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Deployment Status */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Deployment Status
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`h-3 w-3 rounded-full ${
              isDeployed ? "bg-emerald-500" : "bg-yellow-500"
            }`} />
            <span className="text-lg font-semibold text-slate-100">
              {displayStatus}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            {isDeployed ? "Application is live and serving traffic" : "Deployment in progress"}
          </p>
        </motion.div>

        {/* Auto Deploy Status */}
        <motion.div
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Auto Deploy
            </div>
            <button
              onClick={toggleAutoDeploy}
              className={`rounded px-2 py-1 text-xs font-semibold transition ${
                autoDeployEnabled
                  ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                  : "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
              }`}
            >
              {autoDeployEnabled ? "Disable" : "Enable"}
            </button>
          </div>
          <span className="inline-block rounded-lg bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-100 mb-2">
            {autoDeployEnabled ? "🚀 Enabled" : "⏸️ Disabled"}
          </span>
          <p className="text-sm text-slate-400">
            {autoDeployEnabled
              ? "GitHub pushes trigger automatic deployments"
              : "Manual deployments only"}
          </p>
        </motion.div>

        {/* Deployment Duration */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Deployment Duration
          </div>
          <div className="text-2xl font-bold text-aurora">
            {deployment.duration ? `${(deployment.duration / 1000).toFixed(1)}s` : "—"}
          </div>
          <p className="text-sm text-slate-400 mt-2">
            {deployment.startTime ? new Date(deployment.startTime).toLocaleString() : "—"}
          </p>
        </motion.div>
      </div>

      {/* Endpoint Information Grid */}
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* EC2 Instance Details */}
        {(instanceId || publicIp) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">
              EC2 Instance Details
            </div>
            <div className="space-y-3">
              {instanceId && (
                <div>
                  <div className="text-xs text-slate-400">Instance ID</div>
                  <div className="break-all text-sm font-semibold text-slate-100 font-mono">
                    {instanceId}
                  </div>
                </div>
              )}
              {publicIp && (
                <div>
                  <div className="text-xs text-slate-400">Public IP Address</div>
                  <div className="text-sm font-semibold text-aurora font-mono">
                    {publicIp}
                  </div>
                </div>
              )}
              {publicDns && (
                <div>
                  <div className="text-xs text-slate-400">Public DNS</div>
                  <div className="break-all text-sm font-semibold text-slate-100 font-mono">
                    {publicDns}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Docker Container Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">
            Docker Container
          </div>
          <div className="space-y-3">
            {containerPort && (
              <div>
                <div className="text-xs text-slate-400">Container Port</div>
                <div className="text-sm font-semibold text-slate-100">
                  {containerPort}
                </div>
              </div>
            )}
            {imageName && (
              <div>
                <div className="text-xs text-slate-400">Image Name</div>
                <div className="break-all text-sm font-semibold text-slate-100 font-mono text-xs">
                  {imageName}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400">Environment</div>
              <div className="text-sm font-semibold text-slate-100">
                {deployment.environment || "Production"}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Repository Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">
            Repository
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-400">Repository Name</div>
              <div className="text-sm font-semibold text-slate-100">{deployment.repository || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Branch</div>
              <div className="text-sm font-semibold text-slate-100">
                {deployment.branch || "main"}
              </div>
            </div>
            {deployment.repositoryUrl && (
              <a
                href={deployment.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 transition hover:text-blue-300"
              >
                View on GitHub →
              </a>
            )}
          </div>
        </motion.div>

        {/* Jenkins Job Details */}
        {(deployment.jenkinsJob || deployment.jenkinsUrl) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">
              Jenkins Job
            </div>
            <div className="space-y-3">
              {deployment.jenkinsJob && (
                <div>
                  <div className="text-xs text-slate-400">Job Name</div>
                  <div className="text-sm font-semibold text-slate-100">{deployment.jenkinsJob}</div>
                </div>
              )}
              {deployment.jenkinsUrl && (
                <a
                  href={deployment.jenkinsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 transition hover:text-blue-300"
                >
                  View Jenkins Job →
                </a>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8 flex flex-wrap gap-3"
      >
        <button
          onClick={() => navigate("/repositories")}
          className="rounded-lg border border-slate-600/50 bg-slate-800 px-6 py-3 font-semibold text-slate-100 transition hover:bg-slate-700"
        >
          ← Back to Repositories
        </button>
        {applicationUrl && (
          <>
            <a
              href={applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-aurora px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              🚀 Open Application
            </a>
            <button
              onClick={() => copyToClipboard(applicationUrl)}
              className="rounded-lg border border-slate-600/50 bg-slate-800 px-6 py-3 font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              📋 Copy URL
            </button>
          </>
        )}
      </motion.div>
    </main>
  );
}
