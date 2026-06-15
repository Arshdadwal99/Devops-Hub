import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  connectDockerHub,
  disconnectDockerHubRegistry,
  getDockerHubRegistryStatus,
} from "../lib/api";

const EMPTY_STATUS = {
  connected: false,
  username: null,
  connectedAt: null,
  lastValidatedAt: null,
  permissions: { login: false, push: false },
};

export default function DockerHubConnection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [username, setUsername] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);

  const connected = Boolean(status.connected);
  const showForm = editing || !connected;
  const canSubmit = username.trim() && accessToken.trim() && !saving;
  const nextPath = useMemo(() => {
    if (!returnTo) return "/integrations";
    return returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
  }, [returnTo]);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getDockerHubRegistryStatus();
      const nextStatus = response.status || EMPTY_STATUS;
      setStatus(nextStatus);
      if (nextStatus.username) {
        setUsername(nextStatus.username);
      }
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Failed to load Docker Hub status" });
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
      const response = await connectDockerHub(username, accessToken);
      setStatus(response.status || EMPTY_STATUS);
      setAccessToken("");
      setEditing(false);
      setNotice({ type: "success", message: "Docker Hub Connected" });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Docker Hub connection failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      setNotice(null);
      const response = await disconnectDockerHubRegistry();
      setStatus(response.status || EMPTY_STATUS);
      setUsername("");
      setAccessToken("");
      setEditing(false);
      setNotice({ type: "success", message: "Docker Hub disconnected" });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Failed to disconnect Docker Hub" });
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
              Registry Integration
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-100">Connect Docker Hub</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Save a Docker Hub username and access token for image pushes in generated deployment pipelines.
              Tokens are encrypted before storage and never returned by the API.
            </p>
          </div>
          <StatusPill connected={connected} />
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
            Loading Docker Hub status...
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <StatusCard
                label="Connection"
                value={connected ? "Docker Hub Connected" : "Not connected"}
                tone={connected ? "success" : "neutral"}
              />
              <StatusCard
                label="Verify Login"
                value={status.permissions?.login ? "Verified" : "Pending"}
                tone={status.permissions?.login ? "success" : "neutral"}
              />
              <StatusCard
                label="Verify Push"
                value={status.permissions?.push ? "Push allowed" : "Pending"}
                tone={status.permissions?.push ? "success" : "neutral"}
              />
            </div>

            {connected && !showForm && (
              <section className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-emerald-100">Docker Hub Connected</h2>
                    <p className="mt-1 text-sm text-emerald-100/80">
                      Username: <span className="font-semibold">{status.username}</span>
                    </p>
                    {status.lastValidatedAt && (
                      <p className="mt-1 text-xs text-emerald-100/60">
                        Last tested {new Date(status.lastValidatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setAccessToken("");
                      }}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
                    >
                      Change Account
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
                      {connected ? "Change Docker Hub Account" : "Docker Hub Credentials"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      The connection test verifies Docker Hub login and registry push authorization before saving.
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

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Docker Hub Username</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                      placeholder="dockerhub-user"
                      autoComplete="username"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Docker Hub Access Token</span>
                    <input
                      value={accessToken}
                      onChange={(event) => setAccessToken(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                      placeholder="dckr_pat_..."
                      type="password"
                      autoComplete="new-password"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Testing..." : "Test and Save"}
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

function StatusPill({ connected }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      connected
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-slate-700 bg-slate-900 text-slate-300"
    }`}>
      <div className="text-xs uppercase tracking-wide opacity-80">Docker Hub</div>
      <div className="mt-1 font-semibold">{connected ? "Connected" : "Not Connected"}</div>
    </div>
  );
}

function StatusCard({ label, value, tone }) {
  const styles = tone === "success"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
    : "border-slate-800 bg-slate-900 text-slate-300";

  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  );
}
