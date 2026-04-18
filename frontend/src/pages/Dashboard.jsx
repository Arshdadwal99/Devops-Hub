import { useEffect, useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  deployRelease,
  getDashboard,
  restartServices,
  rollbackRelease,
  logout,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import LogAnalysisForm from "../components/LogAnalysisForm";

const stats = [
  { key: "cpu", label: "CPU Usage", suffix: "%" },
  { key: "memory", label: "Memory", suffix: "%" },
  { key: "activeContainers", label: "Containers", suffix: "" },
  { key: "latency", label: "Latency", suffix: " ms" },
];

const actionMap = {
  deploy: deployRelease,
  rollback: rollbackRelease,
  restart: restartServices,
};

function formatStatus(value) {
  return value
    .split("-")
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");
}

function StatusPill({ value }) {
  const tone =
    value === "success" || value === "healthy"
      ? "bg-emerald-400/15 text-emerald-200 border-emerald-300/20"
      : value === "critical"
        ? "bg-red-400/15 text-red-200 border-red-300/20"
        : "bg-sky-400/15 text-sky-200 border-sky-300/20";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${tone}`}>
      {formatStatus(value)}
    </span>
  );
}

function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout: authLogout } = useAuth();

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const data = await getDashboard();
        if (active) {
          setDashboard(data);
          setError("");
          setLastUpdated(new Date());
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      }
    }

    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleAction = (action) => {
    startTransition(async () => {
      try {
        const data = await actionMap[action]();
        setDashboard(data);
        setError("");
        setLastUpdated(new Date());
      } catch (actionError) {
        setError(actionError.message);
      }
    });
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    authLogout();
    navigate("/login");
  };

  if (!dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-3xl px-8 py-6 text-sm text-slate-200">
          Connecting to control center...
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Operator Session
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
            <p className="text-sm text-slate-300">
              {lastUpdated
                ? `Synced ${lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Waiting for first sync"}
            </p>
          </div>
        </div>

        {user && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
            ref={menuRef}
          >
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-left transition hover:border-aurora/40 hover:bg-slate-900/80"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <p className="text-sm font-semibold text-slate-100">{user.name}</p>

              <span
                className={`text-xs text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>

            {menuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute right-0 z-20 mt-3 w-[280px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl"
              >
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(89,246,210,0.2),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-4">
                  <p className="text-sm font-semibold text-slate-100">{user.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{user.email}</p>
                </div>

                <div className="space-y-1 p-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowSettings(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-slate-800/50"
                  >
                    <span className="text-base">⚙️</span>
                    <span className="font-medium">Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowHelp(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-slate-800/50"
                  >
                    <span className="text-base">❓</span>
                    <span className="font-medium">Help</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowSupport(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-slate-800/50"
                  >
                    <span className="text-base">💬</span>
                    <span className="font-medium">Support</span>
                  </button>

                  <div className="my-2 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                  >
                    <span className="text-base">🚪</span>
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="glass-panel relative overflow-hidden rounded-[32px] p-6 sm:p-8"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(89,246,210,0.15),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(103,164,255,0.16),transparent_30%)]" />
        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.4em] text-aurora">
                PulseOps Control Center
              </p>
              <div>
                <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                  Own your pipeline, infra, and deployment flow.
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                  A mini DevOps dashboard with CI visibility, live system metrics,
                  deployment logs, rollback controls, and alerting backed by MongoDB.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => handleAction("deploy")}
                className="rounded-2xl bg-aurora px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
              >
                Deploy Now
              </button>
              <button
                type="button"
                onClick={() => handleAction("restart")}
                className="rounded-2xl border border-white/10 bg-white/8 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={() => handleAction("rollback")}
                className="rounded-2xl border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
              >
                Rollback
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((item, index) => (
              <motion.article
                key={item.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="rounded-3xl border border-white/10 bg-slate-950/40 p-5"
              >
                <p className="text-sm text-slate-400">{item.label}</p>
                <div className="mt-4 flex items-end justify-between">
                  <p className="font-display text-4xl font-bold">
                    {dashboard.metrics[item.key]}
                    <span className="text-lg text-slate-400">{item.suffix}</span>
                  </p>
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-signal/30 to-aurora/20" />
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </motion.section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-[28px] p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                Pipeline Status
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">
                {dashboard.pipeline.workflow}
              </h2>
            </div>
            <StatusPill value={dashboard.pipeline.buildStatus} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <p className="text-sm text-slate-400">Deployment</p>
              <div className="mt-3 flex items-center gap-3">
                <StatusPill value={dashboard.pipeline.deploymentStatus} />
                <span className="text-sm text-slate-300">
                  {dashboard.pipeline.environment}
                </span>
              </div>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                  <span>Progress</span>
                  <span>{dashboard.pipeline.progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-aurora via-signal to-glow"
                    style={{ width: `${dashboard.pipeline.progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <p className="text-sm text-slate-400">Last Commit</p>
              <h3 className="mt-3 text-lg font-semibold text-slate-100">
                {dashboard.pipeline.lastCommit.message}
              </h3>
              <p className="mt-4 text-sm text-slate-400">
                {dashboard.pipeline.lastCommit.hash} by {dashboard.pipeline.lastCommit.author}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                {new Date(dashboard.pipeline.lastCommit.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6 h-72 rounded-3xl border border-white/10 bg-slate-950/35 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Resource trend</p>
                <p className="text-lg font-semibold text-slate-100">
                  CPU + memory over the last 7 hours
                </p>
              </div>
              <p className="text-xs uppercase tracking-[0.25em] text-aurora">
                Auto-refresh 10s
              </p>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.metrics.history}>
                <defs>
                  <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#59f6d2" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#59f6d2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67a4ff" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#67a4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#59f6d2"
                  fill="url(#cpuFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#67a4ff"
                  fill="url(#memFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.article>

        <div className="grid gap-6">
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="glass-panel rounded-[28px] p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                  Release Control
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold">
                  Version {dashboard.controlPanel.currentVersion}
                </h2>
              </div>
              <div className="rounded-2xl border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-slate-300">
                {isPending ? "Updating" : "Ready"}
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-400">Previous</p>
                <p className="mt-2 text-2xl font-semibold">{dashboard.controlPanel.previousVersion}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-400">Last Deploy</p>
                <p className="mt-2 text-base font-semibold">
                  {new Date(dashboard.controlPanel.lastDeploymentAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-3xl border border-aurora/20 bg-aurora/8 p-4 text-sm text-slate-200">
              {dashboard.controlPanel.nextRecommendation}
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="glass-panel rounded-[28px] p-6"
          >
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                Traffic Snapshot
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">
                Requests per hour
              </h2>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.metrics.history}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="traffic" fill="#9c7dff" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.article>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="glass-panel rounded-[28px] p-6"
        >
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Logs Viewer
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              Deployment and error streams
            </h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-aurora">Deployment Logs</p>
              <div className="space-y-3 font-mono text-xs text-slate-300">
                {dashboard.logs.deployment.map((entry) => (
                  <div key={entry} className="rounded-2xl border border-white/5 bg-white/5 p-3">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-red-200">Error Logs</p>
              <div className="space-y-3 font-mono text-xs text-slate-300">
                {dashboard.logs.errorLogs.map((entry) => (
                  <div key={entry} className="rounded-2xl border border-red-300/10 bg-red-500/5 p-3">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="glass-panel rounded-[28px] p-6"
        >
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
              Alerts
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              Live incident feed
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            {dashboard.alerts.map((alert) => (
              <div
                key={`${alert.message}-${alert.createdAt}`}
                className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <StatusPill value={alert.severity} />
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {new Date(alert.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-200">{alert.message}</p>
              </div>
            ))}
          </div>

          {error ? (
            <div className="mt-5 rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </motion.article>
      </section>

      {/* AI Log Analysis Section */}
      <section className="mt-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <LogAnalysisForm />
        </motion.div>
      </section>

      {/* Settings Modal */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowSettings(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
            <p className="mt-2 text-sm text-slate-400">Manage your dashboard preferences</p>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">Dark Mode</p>
                    <p className="text-xs text-slate-400">Currently enabled</p>
                  </div>
                  <input type="checkbox" checked readOnly className="cursor-pointer" />
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">Auto-refresh</p>
                    <p className="text-xs text-slate-400">Updates every 10 seconds</p>
                  </div>
                  <input type="checkbox" checked readOnly className="cursor-pointer" />
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/50 p-4">
                <div>
                  <p className="font-medium text-slate-100">Notification Sound</p>
                  <select className="mt-2 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 border border-white/10">
                    <option>Enabled</option>
                    <option>Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Close
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowHelp(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-100">Help & Documentation</h2>
            <p className="mt-2 text-sm text-slate-400">Find answers and learn how to use PulseOps</p>

            <div className="mt-6 space-y-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-slate-900/50 p-4 transition hover:bg-slate-800/50"
              >
                <p className="font-medium text-slate-100">📖 Documentation</p>
                <p className="mt-1 text-xs text-slate-400">Read the complete user guide</p>
              </a>

              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-slate-900/50 p-4 transition hover:bg-slate-800/50"
              >
                <p className="font-medium text-slate-100">🎥 Video Tutorials</p>
                <p className="mt-1 text-xs text-slate-400">Watch step-by-step guides</p>
              </a>

              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-slate-900/50 p-4 transition hover:bg-slate-800/50"
              >
                <p className="font-medium text-slate-100">❓ FAQ</p>
                <p className="mt-1 text-xs text-slate-400">Common questions and answers</p>
              </a>

              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-slate-900/50 p-4 transition hover:bg-slate-800/50"
              >
                <p className="font-medium text-slate-100">⌨️ Keyboard Shortcuts</p>
                <p className="mt-1 text-xs text-slate-400">Master quick commands</p>
              </a>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Support Modal */}
      {showSupport && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowSupport(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-100">Support</h2>
            <p className="mt-2 text-sm text-slate-400">Get help from our support team</p>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
                <p className="text-sm font-medium text-emerald-300">✓ Status: All Systems Operational</p>
                <p className="mt-1 text-xs text-emerald-200/80">No issues reported</p>
              </div>

              <div className="rounded-xl bg-slate-900/50 p-4">
                <p className="text-sm font-medium text-slate-100">📧 Email Support</p>
                <p className="mt-2 text-sm text-slate-300">support@pulseops.dev</p>
              </div>

              <div className="rounded-xl bg-slate-900/50 p-4">
                <p className="text-sm font-medium text-slate-100">💬 Live Chat</p>
                <p className="mt-1 text-xs text-slate-400">Available 24/7</p>
                <button
                  onClick={() => setShowSupport(false)}
                  className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  Start Chat
                </button>
              </div>

              <div className="rounded-xl bg-slate-900/50 p-4">
                <p className="text-sm font-medium text-slate-100">🐛 Report a Bug</p>
                <p className="mt-1 text-xs text-slate-400">Help us improve PulseOps</p>
                <button
                  onClick={() => setShowSupport(false)}
                  className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  Report Issue
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSupport(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}

export default Dashboard;
