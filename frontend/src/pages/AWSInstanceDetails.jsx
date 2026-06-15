import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getAWSInstance,
  restartAWSInstance,
  startAWSInstance,
  stopAWSInstance,
  terminateAWSInstance,
} from "../lib/api";

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 break-all font-mono text-sm text-slate-100">{value || "None"}</p>
    </div>
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

export default function AWSInstanceDetails() {
  const navigate = useNavigate();
  const { instanceId } = useParams();
  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadInstance = useCallback(async ({ showLoading } = { showLoading: false }) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      const response = await getAWSInstance(instanceId);
      setInstance(response.instance);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load instance details");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instanceId]);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadInstance({ showLoading: true });
  }, [loadInstance]);

  async function runAction(action, request) {
    if (!instance) return;
    const confirmations = {
      stop: `Stop instance ${instance.instanceName || instance.instanceId}?`,
      terminate: `Terminate instance ${instance.instanceName || instance.instanceId}? This cannot be undone.`,
    };

    if (confirmations[action] && !window.confirm(confirmations[action])) return;

    try {
      setActionId(action);
      setNotice("");
      setError("");
      const response = await request(instance.instanceId);
      setNotice(response.message || `${action} requested`);
      await loadInstance({ showLoading: false });
    } catch (err) {
      setError(err.message || `Failed to ${action} instance`);
    } finally {
      setActionId("");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate("/aws/infrastructure")} className="mb-4 text-sm font-semibold text-slate-400 transition hover:text-slate-100">
            Back to AWS Infrastructure
          </button>
          <p className="text-sm uppercase tracking-[0.3em] text-aurora">EC2 Details</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-slate-100">
            {instance?.instanceName || instanceId}
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => loadInstance({ showLoading: false })} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          {instance?.awsConsoleUrl && (
            <a href={instance.awsConsoleUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
              Open AWS Console
            </a>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">{notice}</div>}

      {loading ? (
        <section className="glass-panel rounded-[28px] p-10 text-center text-slate-400">Loading instance details...</section>
      ) : !instance ? (
        <section className="glass-panel rounded-[28px] p-10 text-center">
          <h2 className="text-xl font-semibold text-slate-100">Instance not found</h2>
          <Link to="/aws/infrastructure" className="mt-4 inline-flex rounded-lg border border-aurora/40 px-4 py-2 text-sm font-semibold text-aurora">
            View Infrastructure
          </Link>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="glass-panel rounded-[28px] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-400">Current status</p>
                <p className="mt-1 font-display text-3xl font-bold capitalize text-slate-100">{instance.state || "unknown"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={!canStart(instance.state) || actionId === "start"} onClick={() => runAction("start", startAWSInstance)} className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40">Start</button>
                <button disabled={!canStop(instance.state) || actionId === "stop"} onClick={() => runAction("stop", stopAWSInstance)} className="rounded border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40">Stop</button>
                <button disabled={!canRestart(instance.state) || actionId === "restart"} onClick={() => runAction("restart", restartAWSInstance)} className="rounded border border-signal/40 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40">Restart</button>
                <button disabled={!canTerminate(instance.state) || actionId === "terminate"} onClick={() => runAction("terminate", terminateAWSInstance)} className="rounded border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">Terminate</button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DetailItem label="Instance Name" value={instance.instanceName} />
            <DetailItem label="Instance ID" value={instance.instanceId} />
            <DetailItem label="Public IP" value={instance.publicIp} />
            <DetailItem label="Private IP" value={instance.privateIp} />
            <DetailItem label="Region" value={instance.region} />
            <DetailItem label="Security Group" value={instance.securityGroupName || instance.securityGroupId || instance.securityGroups?.[0]?.GroupId} />
            <DetailItem label="Status" value={instance.state} />
            <DetailItem label="Launch Time" value={formatDate(instance.launchTime)} />
          </section>
        </div>
      )}
    </main>
  );
}
