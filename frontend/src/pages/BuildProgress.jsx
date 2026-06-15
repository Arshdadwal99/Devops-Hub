import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDeploymentWorkflow,
  recalculateWorkflowState,
} from "../lib/api";

const DEFAULT_PROGRESS_STEPS = [
  "Analyze repository",
  "Generate deployment files",
  "Generate Dockerfile",
  "Generate Jenkinsfile",
  "Create Jenkins job",
  "Configure GitHub webhook",
  "Configure credentials",
  "Generate pipeline",
  "Trigger deployment",
];

function formatLogEntry(entry) {
  if (entry == null) return "";
  if (typeof entry !== "object") return String(entry);

  const parts = [];
  if (entry.timestamp) parts.push(new Date(entry.timestamp).toLocaleString());
  if (entry.level) parts.push(String(entry.level).toUpperCase());
  parts.push(entry.message || entry.error || JSON.stringify(entry));
  return parts.filter(Boolean).join(" | ");
}

export default function BuildProgress() {
  const { deploymentId } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow() {
      if (!deploymentId) return;

      try {
        setLoading(true);
        setError("");
        let response;

        try {
          response = await recalculateWorkflowState(deploymentId);
        } catch (recalculateError) {
          console.warn("Workflow recalculation failed, loading saved workflow:", recalculateError);
          response = await getDeploymentWorkflow(deploymentId);
        }

        if (!cancelled) setWorkflow(response);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load deployment progress");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [deploymentId]);

  const progressSteps = useMemo(() => {
    const setupSteps = workflow?.setupSteps?.map((step) => ({
      label: step.label,
      complete: step.status === "complete",
    })) || [];

    const pipelineSteps = workflow?.pipelineSteps?.map((step) => ({
      label: step.label || step,
      complete: Boolean(workflow?.setup?.autoDeployEnabled),
    })) || [];

    const merged = [...setupSteps, ...pipelineSteps].filter((step) => step.label);
    return merged.length ? merged : DEFAULT_PROGRESS_STEPS.map((label) => ({ label, complete: false }));
  }, [workflow]);

  const completedCount = progressSteps.filter((step) => step.complete).length;
  const percent = progressSteps.length
    ? Math.round((completedCount / progressSteps.length) * 100)
    : 0;
  const logs = Array.isArray(workflow?.deployment?.logs) ? workflow.deployment.logs : [];
  const renderedLogs = logs.length
    ? logs.map(formatLogEntry)
    : ["No deployment logs recorded yet."];

  if (loading && !workflow) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-white/10 bg-slate-950 p-6 text-slate-300">
          Loading deployment progress...
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => navigate("/github/repositories")}
        className="mb-5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        Back to repositories
      </button>

      <section className="rounded-lg border border-white/10 bg-slate-950 p-6">
        <div className="border-b border-white/10 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            One-Click Deployment
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Deployment Progress</h1>
          <p className="mt-2 text-sm text-slate-400">
            DevOps Hub is preparing CI/CD and deployment automatically. No manual setup steps are required.
          </p>
          {deploymentId && (
            <p className="mt-2 break-all font-mono text-xs text-slate-500">{deploymentId}</p>
          )}
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="py-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-300">Overall progress</span>
            <span className="text-slate-400">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-aurora transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-200">Automated Steps</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {progressSteps.map((step, index) => {
              const active = !step.complete && index === completedCount;
              return (
                <ProgressStep
                  key={`${step.label}-${index}`}
                  label={step.label}
                  state={step.complete ? "complete" : active ? "active" : "pending"}
                />
              );
            })}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-800 bg-black">
          <div className="border-b border-slate-800 bg-slate-950 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-200">Deployment Logs</h2>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-slate-300">
            {renderedLogs.join("\n")}
          </pre>
        </section>
      </section>
    </main>
  );
}

function ProgressStep({ label, state }) {
  const styles = {
    complete: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    active: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    pending: "border-slate-700 bg-slate-950 text-slate-400",
  };

  const statusLabel = {
    complete: "Done",
    active: "Running",
    pending: "Queued",
  }[state];

  return (
    <div className={`rounded-lg border px-4 py-3 ${styles[state]}`}>
      <div className="text-xs font-bold uppercase">{statusLabel}</div>
      <div className="mt-2 text-sm font-semibold">{label}</div>
    </div>
  );
}
