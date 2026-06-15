import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// 5-Phase workflow structure
const WORKFLOW_PHASES = [
  {
    id: 1,
    name: "Validation",
    description: "Verifying all integrations",
    steps: [
      { key: "github", label: "GitHub repository connected" },
      { key: "docker", label: "Docker Hub connected" },
      { key: "jenkins", label: "Jenkins connected" },
      { key: "aws", label: "AWS account connected" },
    ],
  },
  {
    id: 2,
    name: "Infrastructure",
    description: "Setting up EC2 instance",
    steps: [
      { key: "ec2_check", label: "Check for existing EC2 instance" },
      { key: "ec2_provision", label: "Provision EC2 instance" },
      { key: "ec2_running", label: "Wait until EC2 is running" },
      { key: "docker_install", label: "Install Docker" },
      { key: "docker_compose", label: "Install Docker Compose" },
      { key: "env_configure", label: "Configure deployment environment" },
    ],
  },
  {
    id: 3,
    name: "CI/CD Setup",
    description: "Generating pipeline configuration",
    steps: [
      { key: "gen_deploy_files", label: "Generate deployment files" },
      { key: "gen_dockerfile", label: "Generate Dockerfile" },
      { key: "gen_jenkinsfile", label: "Generate Jenkinsfile" },
      { key: "create_job", label: "Create Jenkins Job" },
      { key: "configure_webhook", label: "Configure GitHub Webhook" },
      { key: "jenkins_creds", label: "Configure Jenkins credentials" },
      { key: "docker_creds", label: "Configure Docker Hub credentials" },
      { key: "pipeline_config", label: "Generate pipeline configuration" },
    ],
  },
  {
    id: 4,
    name: "Deployment",
    description: "Building and deploying application",
    steps: [
      { key: "docker_build", label: "Build Docker image" },
      { key: "docker_push", label: "Push image to Docker Hub" },
      { key: "deploy_ec2", label: "Deploy Application" },
      { key: "health_check", label: "Run health checks" },
      { key: "app_available", label: "Verify application availability" },
    ],
  },
  {
    id: 5,
    name: "Auto Deploy",
    description: "Enabling automatic deployments",
    steps: [
      { key: "webhook_enable", label: "Enable GitHub webhook triggers" },
      { key: "jenkins_auto", label: "Enable automatic Jenkins builds" },
      { key: "auto_deploy_enable", label: "Enable automatic deployment on push" },
    ],
  },
];

export default function DeploymentProgress({
  isOpen,
  deploymentId,
  currentPhase = 1,
  phaseProgress = {},
  overallProgress = 0,
  error = null,
  currentStep = "",
  failedStep = "",
  stackTrace = "",
  jenkinsDetails = null,
  status = "",
  logs = [],
  deploymentOutput = null,
  onClose,
  onRetry,
}) {
  const [expandedPhase, setExpandedPhase] = useState(currentPhase);

  useEffect(() => {
    setExpandedPhase(currentPhase);
  }, [currentPhase]);

  if (!isOpen) return null;

  const deployedUrl = deploymentOutput?.applicationUrl
    || (deploymentOutput?.publicIp ? `http://${deploymentOutput.publicIp}` : "");
  const isComplete = status === "complete";
  const isFailed = error !== null && !isComplete;

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/70" onClick={!isFailed && !isComplete ? undefined : onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
        <motion.section
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0D1117] shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close deployment progress"
            className="absolute right-4 top-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
          >
            X
          </button>

          {/* Header */}
          <header className="border-b border-slate-700 py-5 pl-6 pr-16">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  One-Click Deployment
                </div>
                <h2 className="mt-1 text-2xl font-bold text-slate-100">
                  {isComplete ? "✅ Deployment Complete" : isFailed ? "❌ Deployment Failed" : "🚀 Deploying Application"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {isComplete ? "Successfully deployed" : isFailed ? "Please check the error below" : "Executing automated CI/CD workflow"}
                </p>
                {isComplete && deployedUrl && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">
                      Deployment IP
                    </div>
                    <a
                      href={deployedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all font-mono text-emerald-50 underline decoration-emerald-300/50 underline-offset-4"
                    >
                      {deployedUrl}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Progress Bar */}
          <div className="border-b border-slate-700 px-6 py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-300">Overall Progress</span>
              <span className="text-slate-400">{overallProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.5 }}
                className={`h-full rounded-full transition-colors ${
                  isFailed ? "bg-red-500" : isComplete ? "bg-emerald-500" : "bg-aurora"
                }`}
              />
            </div>
          </div>

          {/* Error Message */}
          {isFailed && error && (
            <div className="border-b border-slate-700 px-6 py-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200">
                <div className="font-semibold">Deployment Error</div>
                <div className="mt-3 grid gap-2 text-sm">
                  <DetailRow label="Current Step" value={currentStep || "Unknown"} />
                  <DetailRow label="Failed Step" value={failedStep || currentStep || "Unknown"} />
                  <DetailRow label="Actual Error Message" value={error} />
                  {jenkinsDetails && (
                    <>
                      <DetailRow label="Jenkins URL" value={jenkinsDetails.baseUrl || "Not provided"} />
                      <DetailRow label="Endpoint Called" value={jenkinsDetails.endpoint || "Not provided"} />
                      <DetailRow label="Root Cause" value={jenkinsDetails.rootCause || "Not classified"} />
                      <DetailRow
                        label="Full Response Message"
                        value={jenkinsDetails.responseBody || jenkinsDetails.message || "No response body returned"}
                      />
                    </>
                  )}
                </div>
                {stackTrace && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-red-100">
                      Stack trace
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-red-500/20 bg-black/30 p-3 text-xs text-red-100">
                      {stackTrace}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Phases */}
          <div className="max-h-96 space-y-3 overflow-y-auto px-6 py-4">
            {WORKFLOW_PHASES.map((phase, phaseIndex) => {
              const phaseNumber = phase.id;
              const phaseData = phaseProgress[phaseNumber] || {};
              const isPhaseActive = phaseNumber === currentPhase;
              const isPhaseDone = phaseNumber < currentPhase;
              const isPhaseFailed = isFailed && isPhaseActive;

              return (
                <motion.div
                  key={phase.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: phaseIndex * 0.05 }}
                  className={`rounded-lg border transition-all ${
                    isPhaseFailed
                        ? "border-red-400/30 bg-red-500/10"
                      : isPhaseActive || expandedPhase === phaseNumber
                        ? "border-blue-400/30 bg-blue-500/10"
                        : isPhaseDone
                          ? "border-emerald-400/30 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-900/50"
                  }`}
                >
                  {/* Phase Header */}
                  <button
                    onClick={() =>
                      setExpandedPhase(expandedPhase === phaseNumber ? null : phaseNumber)
                    }
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <PhaseIndicator
                          phase={phaseNumber}
                          status={
                            isPhaseFailed ? "failed" : isPhaseDone ? "complete" : isPhaseActive ? "active" : "pending"
                          }
                        />
                        <div>
                          <div className="font-semibold text-slate-100">
                            Phase {phaseNumber}: {phase.name}
                          </div>
                          <div className="text-xs text-slate-400">{phase.description}</div>
                        </div>
                      </div>
                      <ChevronIcon
                        isExpanded={expandedPhase === phaseNumber}
                      />
                    </div>
                  </button>

                  {/* Phase Steps */}
                  {expandedPhase === phaseNumber && (
                    <div className="border-t border-current border-opacity-20 px-4 py-3">
                      <div className="space-y-2">
                        {phase.steps.map((step) => {
                          const stepStatus = phaseData[step.key];
                          return (
                            <StepRow
                              key={step.key}
                              label={step.label}
                              status={stepStatus}
                              isPhaseActive={isPhaseActive}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {logs.length > 0 && (
            <div className="border-t border-slate-700 px-6 py-4">
              <div className="mb-2 text-sm font-semibold text-slate-200">Live Logs</div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-300">
                {logs.map((log, index) => (
                  <div key={`${log.timestamp || "log"}-${index}`} className="mb-1 last:mb-0">
                    <span className="text-slate-500">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--:--"}
                    </span>{" "}
                    <span className={log.level === "error" ? "text-red-300" : log.level === "success" ? "text-emerald-300" : "text-slate-300"}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment ID */}
          {deploymentId && (
            <div className="border-t border-slate-700 px-6 py-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400">
                Deployment ID: <span className="font-mono text-slate-200">{deploymentId}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="flex justify-end gap-3 border-t border-slate-700 px-6 py-4">
            {isComplete && (
              <button
                onClick={() => {
                  onClose();
                  // Navigate to deployment dashboard
                  window.location.href = `/deployment/${deploymentId}`;
                }}
                className="rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white transition hover:bg-emerald-500"
              >
                View Deployment
              </button>
            )}
            {isFailed && onRetry && (
              <>
                <button
                  onClick={onRetry}
                  className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-500"
                >
                  Retry
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg bg-slate-800 px-6 py-2 font-semibold text-slate-100 transition hover:bg-slate-700"
                >
                  Close
                </button>
              </>
            )}
            {!isComplete && !isFailed && (
              <button
                disabled
                className="rounded-lg bg-slate-800 px-6 py-2 font-semibold text-slate-100 opacity-50"
              >
                Deployment in Progress...
              </button>
            )}
          </footer>
        </motion.section>
      </div>
    </>
  );
}

function PhaseIndicator({ phase, status }) {
  if (status === "complete") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">
        ✓
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-800 border-t-blue-300" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-xs font-bold text-red-300">
        ✗
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-xs font-semibold text-slate-400">
      {phase}
    </div>
  );
}

function StepRow({ label, status, isPhaseActive }) {
  let icon = "◯";
  let iconColor = "text-slate-500";

  if (status === "complete") {
    icon = "✓";
    iconColor = "text-emerald-400";
  } else if (status === "active") {
    iconColor = "text-blue-400";
  } else if (status === "failed") {
    icon = "✗";
    iconColor = "text-red-400";
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`font-bold ${iconColor}`}>{icon}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-red-100/70">{label}</div>
      <div className="mt-1 break-words rounded border border-red-500/20 bg-black/20 px-3 py-2 text-red-50">
        {value}
      </div>
    </div>
  );
}

function ChevronIcon({ isExpanded }) {
  return (
    <svg
      className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}
