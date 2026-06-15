import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProvisioningDebug } from "../lib/api";

function formatValue(value) {
  if (!value) return "None";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 break-all font-mono text-sm text-slate-100">{value || "None"}</p>
    </div>
  );
}

function getLogMessage(log) {
  if (log == null) return "";
  if (typeof log !== "object") return String(log);
  return log.message || log.error || JSON.stringify(log);
}

export default function AWSJobDebug() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [debug, setDebug] = useState(null);
  const [error, setError] = useState("");
  const debugLogs = Array.isArray(debug?.logs) ? debug.logs : [];

  useEffect(() => {
    let cancelled = false;
    let timerId;

    const loadDebug = async () => {
      try {
        const response = await getProvisioningDebug(jobId);
        if (!cancelled) {
          setDebug(response);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load job debug details");
        }
      } finally {
        if (!cancelled) {
          timerId = window.setTimeout(loadDebug, 2000);
        }
      }
    };

    loadDebug();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [jobId]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          Back
        </button>
        <h1 className="text-3xl font-bold text-slate-100">Infrastructure Job Debug</h1>
        <p className="mt-2 break-all text-sm font-mono text-slate-400">{jobId}</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {!debug && !error && <div className="text-slate-400">Loading debug details...</div>}

      {debug && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Current Step" value={formatValue(debug.currentStep)} />
            <Field label="Last Successful Step" value={formatValue(debug.lastSuccessfulStep)} />
            <Field
              label="AWS Operation"
              value={debug.currentOperation || debug.awsOperation || "None"}
            />
          </div>

          {debug.error && Object.keys(debug.error).length > 0 && (
            <section className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h2 className="mb-3 text-lg font-semibold text-red-200">Errors</h2>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-4 text-xs text-red-100">
                {JSON.stringify(debug.error, null, 2)}
              </pre>
            </section>
          )}

          <section className="rounded-lg border border-slate-700/60 bg-slate-900/60">
            <div className="border-b border-slate-700/60 p-4">
              <h2 className="text-lg font-semibold text-slate-100">Logs</h2>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              {debugLogs.length === 0 && (
                <div className="p-4 text-sm text-slate-400">No logs recorded yet.</div>
              )}
              {debugLogs.map((log, index) => {
                const isObject = log && typeof log === "object";
                const timestamp = isObject && log.timestamp ? log.timestamp : Date.now();
                const level = isObject ? log.level : "";
                const details = isObject && log.details && typeof log.details === "object" ? log.details : null;

                return (
                  <div
                    key={`${isObject ? log._id || log.timestamp || "log" : "log"}-${index}`}
                    className="border-b border-slate-800 p-4 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{new Date(timestamp).toLocaleString()}</span>
                      {level && <span className="rounded bg-slate-800 px-2 py-1 uppercase">{level}</span>}
                      {isObject && log.awsOperation && (
                        <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-200">
                          {log.awsOperation}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-100">{getLogMessage(log)}</p>
                    {details && Object.keys(details).length > 0 && (
                      <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-3 text-xs text-slate-300">
                        {JSON.stringify(details, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
