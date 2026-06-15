const STEPS = [
  { key: "clone", label: "Cloning Repository" },
  { key: "validate", label: "Validating Files" },
  { key: "workspace", label: "Preparing Workspace" },
  { key: "ready", label: "Readiness Report" },
];

export default function DeploymentPreparationModal({
  isOpen,
  repository,
  status,
  error,
  deployment,
  onClose,
  onOpenWorkspace,
}) {
  if (!isOpen) return null;

  const activeIndex = getActiveIndex(status);

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/70" onClick={status === "preparing" ? undefined : onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-[#0D1117] shadow-2xl">
          <header className="border-b border-slate-700 px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              CI/CD Setup
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">
              Preparing Repository
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {repository?.name || "Repository"} is being prepared for the automated deployment workflow.
            </p>
          </header>

          <div className="space-y-4 px-6 py-5">
            {STEPS.map((step, index) => {
              const stepState = getStepState({ status, activeIndex, index });
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <StepIndicator state={stepState} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{step.label}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          stepState === "failed" ? "bg-red-500" : "bg-emerald-500"
                        }`}
                        style={{ width: stepState === "pending" ? "0%" : "100%" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {deployment?.deploymentId && (
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400">
                Deployment ID: <span className="font-mono text-slate-200">{deployment.deploymentId}</span>
              </div>
            )}

            {status === "ready" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
                <div className="font-semibold">Repository Connected</div>
                <div className="mt-1 text-xs text-emerald-100/80">
                  DevOps Hub will continue with credentials, pipeline generation, and auto deploy automatically.
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <footer className="flex justify-end border-t border-slate-700 px-6 py-4">
            {status === "ready" && (
              <button
                onClick={() => onOpenWorkspace?.(deployment?.deploymentId)}
                className="mr-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                View Deployment Progress
              </button>
            )}
            <button
              onClick={onClose}
              disabled={status === "preparing"}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "preparing" ? "Preparing..." : "Close"}
            </button>
          </footer>
        </section>
      </div>
    </>
  );
}

function StepIndicator({ state }) {
  if (state === "active") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-800 border-t-blue-300" />
      </div>
    );
  }

  if (state === "complete") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">
        OK
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-sm font-bold text-red-300">
        X
      </div>
    );
  }

  return <div className="h-8 w-8 shrink-0 rounded-full border border-slate-700 bg-slate-900" />;
}

function getActiveIndex(status) {
  if (status === "ready") return STEPS.length;
  if (status === "failed") return 0;
  return 1;
}

function getStepState({ status, activeIndex, index }) {
  if (status === "failed" && index === activeIndex) return "failed";
  if (status === "ready") return "complete";
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "active";
  return "pending";
}
