import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  connectAWS,
  getAWSConnections,
  disconnectAWS,
  getInstanceTypes,
  getAWSConnection,
  getInfrastructure,
} from "../lib/api";
import { AWS_REGIONS, isValidRegionCode, getFullRegionLabel } from "../constants/awsRegions";

function InfoItem({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-100 font-medium mt-1">{value || "—"}</span>
    </div>
  );
}

export default function AWSConnection() {
  const navigate = useNavigate();
  const { connectionId } = useParams();
  const [view, setView] = useState("list"); // list, dashboard, connect
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [infrastructure, setInfrastructure] = useState([]);

  // Connection form state
  const [connectionName, setConnectionName] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState("us-east-1");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    loadConnections();
  }, []);

  useEffect(() => {
    if (connectionId && connections.length > 0) {
      const conn = connections.find((c) => c._id === connectionId);
      if (conn) {
        setSelectedConnection(conn);
        setView("dashboard");
        loadInfrastructure();
      }
    }
  }, [connectionId, connections]);

  const loadConnections = async () => {
    try {
      const response = await getAWSConnections();
      setConnections(response.connections || []);
      
      // Log loaded connections with region codes
      if (response.connections?.length > 0) {
        console.log("[AWS Connection] Loaded AWS connections", {
          count: response.connections.length,
          connections: response.connections.map((c) => ({
            id: c._id,
            name: c.connectionName,
            region: c.region,
            accountId: c.accountId,
          })),
        });
      }
      
      if (!connectionId && response.connections?.length > 0) {
        setView("list");
      }
    } catch (err) {
      console.error("[AWS Connection] Failed to load connections:", err);
    }
  };

  const loadInfrastructure = async () => {
    try {
      const response = await getInfrastructure();
      const filtered = response.infrastructure?.filter(
        (inf) => inf.awsConnectionId._id === connectionId
      ) || [];
      setInfrastructure(filtered);
    } catch (err) {
      console.error("Failed to load infrastructure:", err);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!connectionName || !accessKeyId || !secretAccessKey || !region) {
        throw new Error("All fields are required");
      }

      // Validate region code
      if (!isValidRegionCode(region)) {
        throw new Error("Invalid AWS region selected");
      }

      // Log region information
      const regionLabel = getFullRegionLabel(region);
      console.log(`[AWS Connection] Connecting to region: ${regionLabel} (Code: ${region})`);

      // Only send region code to backend, not the display label
      const response = await connectAWS(accessKeyId, secretAccessKey, region, connectionName);

      console.log(`[AWS Connection] Successfully connected to account ${response.accountInfo.accountId} in region ${region}`);

      setSuccess(`✅ Connected to AWS account ${response.accountInfo.accountId} in ${regionLabel}`);
      setConnectionName("");
      setAccessKeyId("");
      setSecretAccessKey("");

      // Reload connections
      await loadConnections();
      setView("list");

      setTimeout(() => {
        setSuccess("");
      }, 5000);
    } catch (err) {
      // Extract detailed error information from backend response
      const backendData = err.data || {};
      const backendError = backendData.error || err.message || "Failed to connect to AWS";
      const backendDetails = backendData.details || "";
      const failureType = backendData.failureType || "UNKNOWN_ERROR";
      const errorCode = backendData.errorCode || "";
      const requestId = backendData.requestId || "unknown";
      
      // Build comprehensive error message
      let displayError = backendError;
      if (backendDetails) {
        displayError += `: ${backendDetails}`;
      }

      // Log full debugging information to console
      console.error(`[AWS Connection Error]`, {
        error: backendError,
        details: backendDetails,
        failureType: failureType,
        errorCode: errorCode,
        requestId: requestId,
        timestamp: new Date().toISOString(),
        message: `Error connecting to AWS - Check backend logs with requestId: ${requestId}`,
      });

      // Display user-friendly error message
      setError(displayError);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (connId) => {
    if (!window.confirm("Are you sure you want to disconnect this AWS account? All infrastructure will remain but will not be managed.")) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      await disconnectAWS(connId);
      setSuccess("✅ AWS connection disconnected");
      await loadConnections();
      setView("list");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to disconnect");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (connId) => {
    setLoading(true);
    try {
      await getAWSConnection(connId);
      setSuccess("✅ Connection test successful");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError("❌ Connection test failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/integrations")}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          ← Back to Integrations
        </button>
        <h1 className="text-3xl font-bold text-slate-100">AWS Account Management</h1>
        <p className="mt-2 text-slate-400">
          Connect and manage AWS accounts for infrastructure provisioning
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg flex-shrink-0">❌</span>
            <div className="flex-grow">
              <div className="font-semibold">{error}</div>
              <div className="mt-2 text-xs text-red-200/70 font-mono">
                💡 Check browser console (F12) and backend logs for detailed debugging information
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300"
        >
          {success}
        </motion.div>
      )}

      {/* List View */}
      {view === "list" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {connections.length > 0 && (
            <div className="grid gap-6">
              {connections.map((conn) => (
                <motion.div
                  key={conn._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-6 backdrop-blur-xl hover:border-emerald-500/30 transition"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <span className="text-2xl">☁️</span>
                        {conn.connectionName}
                      </h3>
                      <p className="mt-2 text-slate-400">{conn.accountName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-500/50">
                        ✓ Connected
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-white/10">
                    <InfoItem label="Account ID" value={conn.accountId} />
                    <InfoItem label="Region" value={conn.region} />
                    <InfoItem label="Infrastructure" value={infrastructure?.filter((i) => i.awsConnectionId._id === conn._id).length || 0} />
                    <InfoItem label="Connected" value={new Date(conn.validatedAt).toLocaleDateString()} />
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => {
                        setSelectedConnection(conn);
                        setView("dashboard");
                      }}
                      className="flex-1 min-w-[200px] rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      📊 Dashboard
                    </button>
                    <button
                      onClick={() => navigate(`/aws/${conn._id}/provision`)}
                      className="flex-1 min-w-[200px] rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/20"
                    >
                      ⚙️ Create Infrastructure
                    </button>
                    <button
                      onClick={() => handleTestConnection(conn._id)}
                      disabled={loading}
                      className="rounded-lg border border-slate-600/50 bg-slate-700/30 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
                    >
                      🔗 Test
                    </button>
                    <button
                      onClick={() => handleDisconnect(conn._id)}
                      disabled={loading}
                      className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      🔌 Disconnect
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <button
            onClick={() => setView("connect")}
            className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            + Add New AWS Account
          </button>
        </motion.div>
      )}

      {/* Dashboard View */}
      {view === "dashboard" && selectedConnection && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <button
            onClick={() => {
              setView("list");
              setSelectedConnection(null);
            }}
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200 mb-4"
          >
            ← Back to Connections
          </button>

          {/* Account Dashboard */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                  <span className="text-3xl">☁️</span>
                  {selectedConnection.connectionName}
                </h2>
                <p className="mt-2 text-slate-400">AWS Account Management Dashboard</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Status</div>
                <div className="text-2xl font-bold text-emerald-200 mt-1">✅ Connected</div>
              </div>
            </div>

            {/* Account Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 pb-8 border-b border-white/10">
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">AWS Account ID</div>
                <div className="font-mono text-lg text-slate-100">{selectedConnection.accountId}</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Account Alias</div>
                <div className="text-lg text-slate-100">{selectedConnection.accountName}</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Connected Region</div>
                <div className="text-lg text-slate-100">{selectedConnection.region}</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Connection Status</div>
                <div className="text-lg text-emerald-200 font-semibold">Active</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Connected At</div>
                <div className="text-lg text-slate-100">{new Date(selectedConnection.validatedAt).toLocaleDateString()}</div>
              </div>
              <div className="rounded-lg bg-slate-800/30 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Infrastructure Count</div>
                <div className="text-lg text-slate-100 font-bold">{infrastructure?.filter((i) => i.awsConnectionId._id === selectedConnection._id).length || 0}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => navigate(`/aws/${selectedConnection._id}/provision`)}
                className="flex-1 min-w-[250px] rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 flex items-center justify-center gap-2"
              >
                <span className="text-xl">⚙️</span>
                Create Infrastructure
              </button>
              <button
                onClick={() => navigate("/aws/infrastructure")}
                className="flex-1 min-w-[250px] rounded-lg border border-blue-500/50 bg-blue-500/10 px-6 py-3 font-semibold text-blue-200 transition hover:bg-blue-500/20 flex items-center justify-center gap-2"
              >
                <span className="text-xl">📊</span>
                Manage Infrastructure
              </button>
            </div>
          </div>

          {/* Infrastructure List */}
          {infrastructure.filter((i) => i.awsConnectionId._id === selectedConnection._id).length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl">
              <h3 className="text-xl font-bold text-slate-100 mb-6">Infrastructure Instances</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {infrastructure
                  .filter((i) => i.awsConnectionId._id === selectedConnection._id)
                  .map((inf) => (
                    <div
                      key={inf._id}
                      className="flex items-center justify-between p-4 rounded-lg border border-slate-700/50 bg-slate-800/20 hover:border-slate-600 transition cursor-pointer"
                      onClick={() => navigate("/aws/infrastructure")}
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-slate-100">{inf.instanceId}</div>
                        <div className="text-sm text-slate-400 mt-1">{inf.instanceType} • {inf.operatingSystem} • {inf.region}</div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          inf.deploymentStatus === "ready"
                            ? "bg-emerald-500/20 text-emerald-200"
                            : inf.deploymentStatus === "provisioning"
                            ? "bg-blue-500/20 text-blue-200"
                            : inf.deploymentStatus === "error"
                            ? "bg-red-500/20 text-red-200"
                            : "bg-slate-700/20 text-slate-300"
                        }`}>
                          {inf.deploymentStatus}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Connect Form */}
      {view === "connect" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          <button
            onClick={() => setView("list")}
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200 mb-4"
          >
            ← Back to Connections
          </button>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 backdrop-blur-xl">
            <h2 className="mb-6 text-2xl font-bold text-slate-100">Connect New AWS Account</h2>

            <form onSubmit={handleConnect} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-2">
                  Connection Name
                </label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="e.g., My AWS Account"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-2">
                  AWS Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Region code being sent: <span className="font-mono text-slate-300">{region}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-2">
                  AWS Access Key ID
                </label>
                <input
                  type="password"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Found in AWS IAM console → Security credentials → Access keys
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-2">
                  AWS Secret Access Key
                </label>
                <input
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder="●●●●●●●●●●●●●●●●●●●●"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Keep this secret - never share or commit to version control
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Connecting..." : "Connect to AWS"}
              </button>
            </form>

            <div className="mt-8 rounded-lg bg-slate-800/30 p-4">
              <p className="text-xs text-slate-300 font-semibold mb-3">
                💡 How to create AWS credentials:
              </p>
              <ol className="space-y-2 text-xs text-slate-400">
                <li>✓ Sign in to AWS Management Console</li>
                <li>✓ Go to IAM → Users → Create user</li>
                <li>✓ Attach policies: EC2FullAccess, SecurityGroupAdministration, STSAssumeRole</li>
                <li>✓ Create access keys → Save them securely</li>
                <li>✓ Paste them above to establish connection</li>
              </ol>
            </div>
          </div>
        </motion.div>
      )}
    </main>
  );
}
