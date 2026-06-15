import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  connectJenkins,
  disconnectJenkins,
  getJenkinsConnectionStatus,
  testJenkinsConnection,
} from "../lib/api";

const EMPTY_STATUS = {
  connected: false,
  url: null,
  username: null,
  connectedUser: null,
  version: null,
  permissions: {
    reachable: false,
    authenticated: false,
    read: false,
    jobRead: false,
    nodeRead: false,
  },
  jobs: [],
  nodes: [],
  validationErrors: [],
};

const CHECKS = [
  ["reachable", "Jenkins Reachable"],
  ["authenticated", "Authentication Valid"],
  ["read", "Overall Read"],
  ["jobRead", "Job Permissions"],
  ["nodeRead", "Node Permissions"],
];

export default function JenkinsConnection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);

  const connected = Boolean(status.connected);
  const validated = jenkinsReady(status);
  const showForm = editing || !connected;
  const nextPath = useMemo(() => {
    if (!returnTo) return "/integrations";
    return returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
  }, [returnTo]);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getJenkinsConnectionStatus();
      const nextStatus = response.status || EMPTY_STATUS;
      setStatus(nextStatus);
      if (nextStatus.url) setUrl(nextStatus.url);
      if (nextStatus.username) setUsername(nextStatus.username);
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Failed to load Jenkins status" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleConnect(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setNotice(null);
      const response = await connectJenkins(url, username, apiToken);
      if (!response.success) {
        setNotice({ type: "error", message: response.message || "Jenkins validation failed" });
        if (response.test) {
          setStatus({ ...EMPTY_STATUS, url, username, ...response.test });
        }
        return;
      }
      setStatus(response.status || EMPTY_STATUS);
      setApiToken("");
      setEditing(false);
      setNotice({ type: "success", message: "Jenkins Connected" });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Jenkins connection failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSaved() {
    try {
      setTesting(true);
      setNotice(null);
      const response = await testJenkinsConnection();
      setStatus(response.status || EMPTY_STATUS);
      setNotice({
        type: response.success ? "success" : "error",
        message: response.message || (response.success ? "Jenkins validation passed" : "Jenkins validation failed"),
      });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Jenkins test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      setNotice(null);
      const response = await disconnectJenkins();
      setStatus(response.status || EMPTY_STATUS);
      setUrl("");
      setUsername("");
      setApiToken("");
      setEditing(false);
      setNotice({ type: "success", message: "Jenkins disconnected" });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Failed to disconnect Jenkins" });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => navigate(returnTo ? nextPath : "/integrations")}
        className="mb-5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        Back
      </button>

      <section className="rounded-lg border border-white/10 bg-slate-950 p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pipeline Orchestrator
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-100">Connect Jenkins</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Validate Jenkins reachability, authentication, jobs, and agents before generating deployment pipelines.
              API tokens are encrypted before storage and never returned by the API.
            </p>
          </div>
          <StatusPill connected={connected} validated={validated} />
        </div>

        {notice && (
          <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}>
            {notice.message}
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
            Loading Jenkins status...
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoCard label="Connection" value={connected ? "Jenkins Connected" : "Not connected"} tone={connected ? "success" : "neutral"} />
              <InfoCard label="Jenkins Version" value={status.version || "Unavailable"} tone="neutral" />
              <InfoCard label="Connected User" value={status.connectedUser || status.username || "Pending"} tone="neutral" />
            </div>

            <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-100">Validation</h2>
                  {connected && (
                    <button
                      type="button"
                      onClick={handleTestSaved}
                      disabled={testing}
                      className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {testing ? "Testing..." : "Test Connection"}
                    </button>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {CHECKS.map(([key, label]) => (
                    <CheckRow key={key} label={label} ok={Boolean(status.permissions?.[key])} />
                  ))}
                </div>
                {status.validationErrors?.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {status.validationErrors.join(" | ")}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-sm font-semibold text-slate-100">Available Agents/Nodes</h2>
                <div className="mt-4 space-y-2">
                  {(status.nodes?.length ? status.nodes : [{ displayName: "No nodes available", offline: true, executors: 0 }]).map((node) => (
                    <div key={node.displayName} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{node.displayName}</div>
                        <div className="text-xs text-slate-500">{node.executors || 0} executors</div>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${
                        node.offline ? "bg-red-500/10 text-red-200" : "bg-emerald-500/10 text-emerald-200"
                      }`}>
                        {node.offline ? "Offline" : "Online"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-sm font-semibold text-slate-100">Existing Jobs</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(status.jobs?.length ? status.jobs : [{ name: "No jobs visible", color: "disabled" }]).map((job) => (
                  <div key={job.name} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                    <div className="truncate text-sm font-semibold text-slate-100">{job.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{job.color || "unknown"}</div>
                  </div>
                ))}
              </div>
            </section>

            {connected && !showForm && (
              <section className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-emerald-100">Jenkins Connected</h2>
                    <p className="mt-1 text-sm text-emerald-100/80">
                      URL: <span className="font-semibold">{status.url}</span>
                    </p>
                    <p className="mt-1 text-sm text-emerald-100/80">
                      User: <span className="font-semibold">{status.connectedUser || status.username}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setApiToken("");
                      }}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
                    >
                      Update Connection
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {disconnecting ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {showForm && (
              <form onSubmit={handleConnect} className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">
                      {connected ? "Update Jenkins Connection" : "Jenkins Credentials"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Jenkins must be reachable and the user must be able to read jobs and nodes.
                    </p>
                  </div>
                  {connected && (
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Jenkins URL</span>
                    <input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                      placeholder="http://jenkins.example.com:8080"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Username</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">API Token</span>
                    <input
                      value={apiToken}
                      onChange={(event) => setApiToken(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                      placeholder="Jenkins API token"
                      type="password"
                      autoComplete="new-password"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={!url.trim() || !username.trim() || !apiToken.trim() || saving}
                    className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Validating..." : "Validate and Save"}
                  </button>
                  {connected && returnTo && (
                    <button
                      type="button"
                      onClick={() => navigate(nextPath)}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                    >
                      Continue Setup
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function jenkinsReady(status) {
  const permissions = status?.permissions || {};
  return Boolean(
    status?.connected &&
      permissions.reachable &&
      permissions.authenticated &&
      permissions.read &&
      permissions.jobRead &&
      permissions.nodeRead
  );
}

function StatusPill({ connected, validated }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      validated
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : connected
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-slate-700 bg-slate-900 text-slate-300"
    }`}>
      <div className="text-xs uppercase tracking-wide opacity-80">Jenkins</div>
      <div className="mt-1 font-semibold">{validated ? "Validated" : connected ? "Connected" : "Not Connected"}</div>
    </div>
  );
}

function InfoCard({ label, value, tone }) {
  const styles = tone === "success"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
    : "border-slate-800 bg-slate-900 text-slate-300";

  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 break-all text-base font-semibold">{value}</div>
    </div>
  );
}

function CheckRow({ label, ok }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <span className="text-sm text-slate-200">{label}</span>
      <span className={`rounded px-2 py-1 text-xs font-semibold ${
        ok ? "bg-emerald-500/10 text-emerald-200" : "bg-slate-800 text-slate-400"
      }`}>
        {ok ? "Passed" : "Pending"}
      </span>
    </div>
  );
}
