import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getAWSConnections,
  getAWSInstances,
  restartAWSInstance,
  startAWSInstance,
  stopAWSInstance,
  terminateAWSInstance,
} from "../lib/api";

const FILTERS = ["all", "running", "stopped", "pending", "terminated"];

const STATUS_STYLES = {
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  stopped: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  stopping: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "shutting-down": "border-red-500/30 bg-red-500/10 text-red-200",
  terminated: "border-red-500/30 bg-red-500/10 text-red-200",
};

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function StatusBadge({ state }) {
  const normalized = String(state || "unknown").toLowerCase();
  return (
    <span className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[normalized] || "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
      {normalized}
    </span>
  );
}

function StatCard({ label, value, accent = "text-slate-100" }) {
  return (
    <article className="glass-panel rounded-lg p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className={`mt-3 font-display text-3xl font-bold ${accent}`}>{value}</p>
    </article>
  );
}

function canStart(state) {
  return state === "stopped";
}

function canStop(state) {
  return state === "running";
}

function canRestart(state) {
  return state === "running";
}

function canTerminate(state) {
  return !["terminated", "shutting-down"].includes(state);
}

export default function AWSInfrastructureManagement() {
  const navigate = useNavigate();
  const { connectionId } = useParams();
  const [instances, setInstances] = useState([]);
  const [connections, setConnections] = useState([]);
  const [connectedAccountsCount, setConnectedAccountsCount] = useState(0);
  const [regions, setRegions] = useState([]);
  const [stats, setStats] = useState({ total: 0, running: 0, stopped: 0, pending: 0, terminated: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const connectedAccounts = connections.filter((connection) => connection.connected !== false);
  const defaultConnectionId = connectionId || connectedAccounts[0]?._id;

  const queryParams = useMemo(
    () => ({
      connectionId,
      search,
      status: statusFilter === "all" ? "" : statusFilter,
      region: regionFilter === "all" ? "" : regionFilter,
    }),
    [connectionId, regionFilter, search, statusFilter]
  );

  const loadConnections = useCallback(async () => {
    try {
      const response = await getAWSConnections();
      setConnections(response.connections || []);
      setConnectedAccountsCount((response.connections || []).filter((connection) => connection.connected !== false).length);
    } catch (err) {
      setError(err.message || "Failed to load AWS accounts");
    }
  }, []);

  const loadInstances = useCallback(async ({ showLoading } = { showLoading: false }) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      const response = await getAWSInstances(queryParams);
      setInstances(response.instances || []);
      setRegions(response.regions || []);
      setStats(response.stats || { total: 0, running: 0, stopped: 0, pending: 0, terminated: 0 });
      if (typeof response.connectedAccounts === "number") setConnectedAccountsCount(response.connectedAccounts);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load AWS infrastructure");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryParams]);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    loadInstances({ showLoading: true });
    const interval = window.setInterval(() => loadInstances({ showLoading: false }), 15000);
    return () => window.clearInterval(interval);
  }, [loadInstances]);

  async function runAction(instance, action, request) {
    const confirmations = {
      stop: `Stop instance ${instance.instanceName || instance.instanceId}?`,
      terminate: `Terminate instance ${instance.instanceName || instance.instanceId}? This cannot be undone.`,
    };

    if (confirmations[action] && !window.confirm(confirmations[action])) return;

    try {
      setActionId(`${action}:${instance.instanceId}`);
      setError("");
      setNotice("");
      const response = await request(instance.instanceId);
      setNotice(response.message || `${action} requested`);
      await loadInstances({ showLoading: false });
    } catch (err) {
      setError(err.message || `Failed to ${action} instance`);
    } finally {
      setActionId("");
    }
  }

  function createInfrastructure() {
    if (defaultConnectionId) {
      navigate(`/aws/${defaultConnectionId}/provision`);
    } else {
      navigate("/aws/connect");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-aurora">AWS Infrastructure</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-slate-100">Infrastructure Dashboard</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Monitor EC2 instances across connected AWS accounts and operate them from one control surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => loadInstances({ showLoading: false })}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={createInfrastructure}
            className="rounded-lg border border-aurora/40 bg-aurora/10 px-4 py-2.5 text-sm font-semibold text-aurora transition hover:bg-aurora/20"
          >
            Create Infrastructure
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">{notice}</div>}

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Instances" value={stats.total || 0} />
        <StatCard label="Running Instances" value={stats.running || 0} accent="text-emerald-200" />
        <StatCard label="Stopped Instances" value={stats.stopped || 0} accent="text-slate-200" />
        <StatCard label="Connected AWS Accounts" value={connectedAccountsCount || connectedAccounts.length || 0} accent="text-signal" />
      </section>

      <section className="mb-6 glass-panel rounded-lg p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_14rem]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or instance ID"
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-aurora/60"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-aurora/60"
          >
            {FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter === "all" ? "All statuses" : filter[0].toUpperCase() + filter.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none transition focus:border-aurora/60"
          >
            <option value="all">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/55">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">EC2 Instances</h2>
          <span className="text-xs text-slate-500">{instances.length} shown</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading AWS infrastructure...</div>
        ) : instances.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-lg font-semibold text-slate-100">No instances found</h3>
            <p className="mt-2 text-sm text-slate-400">Connect an AWS account, create infrastructure, or adjust the filters.</p>
            <button
              type="button"
              onClick={createInfrastructure}
              className="mt-5 rounded-lg border border-aurora/40 bg-aurora/10 px-4 py-2.5 text-sm font-semibold text-aurora transition hover:bg-aurora/20"
            >
              Create Infrastructure
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-950/70">
                <tr>
                  {["Name", "Instance ID", "Public IP", "State", "Region", "Instance Type", "Launch Time", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {instances.map((instance) => (
                  <tr key={`${instance.region}:${instance.instanceId}`} className="align-top transition hover:bg-white/[0.03]">
                    <td className="px-4 py-4 font-semibold text-slate-100">{instance.instanceName || "Unnamed"}</td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-300">{instance.instanceId}</td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-300">{instance.publicIp || "None"}</td>
                    <td className="px-4 py-4"><StatusBadge state={instance.state} /></td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-300">{instance.region}</td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-300">{instance.instanceType}</td>
                    <td className="px-4 py-4 text-sm text-slate-300">{formatDate(instance.launchTime)}</td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-80 flex-wrap gap-2">
                        <button disabled={!canStart(instance.state) || actionId === `start:${instance.instanceId}`} onClick={() => runAction(instance, "start", startAWSInstance)} className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40">Start</button>
                        <button disabled={!canStop(instance.state) || actionId === `stop:${instance.instanceId}`} onClick={() => runAction(instance, "stop", stopAWSInstance)} className="rounded border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40">Stop</button>
                        <button disabled={!canRestart(instance.state) || actionId === `restart:${instance.instanceId}`} onClick={() => runAction(instance, "restart", restartAWSInstance)} className="rounded border border-signal/40 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40">Reboot</button>
                        <button disabled={!canTerminate(instance.state) || actionId === `terminate:${instance.instanceId}`} onClick={() => runAction(instance, "terminate", terminateAWSInstance)} className="rounded border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">Terminate</button>
                        <Link to={`/aws/infrastructure/${instance.instanceId}`} className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10">SSH Info</Link>
                        <Link to={`/aws/infrastructure/${instance.instanceId}`} className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10">View Details</Link>
                        <a href={instance.awsConsoleUrl} target="_blank" rel="noreferrer" className="rounded border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Open AWS Console</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
