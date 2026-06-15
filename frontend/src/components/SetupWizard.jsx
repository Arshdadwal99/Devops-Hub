import { Component, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const DefaultIcon = "?";

const INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub",
    description: "Connect your GitHub account to access repositories",
    icon: "GH",
    requiredFor: "Repository access",
    actionText: "Connect GitHub",
    route: "/integrations",
  },
  {
    id: "dockerhub",
    aliases: ["docker"],
    name: "Docker Hub",
    description: "Push Docker images and manage container registry",
    icon: "DH",
    requiredFor: "Container registry",
    actionText: "Connect Docker Hub",
    route: "/integrations",
  },
  {
    id: "jenkins",
    name: "Jenkins",
    description: "Automate builds and deployments",
    icon: "JK",
    requiredFor: "CI/CD orchestration",
    actionText: "Connect Jenkins",
    route: "/integrations",
  },
  {
    id: "aws",
    name: "AWS",
    description: "Connect your AWS account for automatic EC2 provisioning and infrastructure management",
    icon: "AWS",
    requiredFor: "Infrastructure provisioning (EC2 will be auto-provisioned)",
    actionText: "Connect AWS",
    route: "/integrations",
  },
];

function ErrorState({ title, message, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/70" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0D1117] p-6 shadow-2xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-300">
            Setup Error
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
          >
            Close
          </button>
        </section>
      </div>
    </>
  );
}

function normalizeIntegrationId(id) {
  const normalized = String(id || "").trim().toLowerCase();
  if (normalized === "docker") return "dockerhub";
  return normalized;
}

function findIntegration(id) {
  const normalized = normalizeIntegrationId(id);
  return INTEGRATIONS.find((integration) => {
    return integration.id === normalized || integration.aliases?.includes(normalized);
  });
}

class SetupWizardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("SetupWizard crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="Workflow configuration missing"
          message="Step configuration could not be loaded."
          onClose={this.props.onClose}
        />
      );
    }

    return this.props.children;
  }
}

function SetupWizardContent({ isOpen, missingIntegrations = [], onClose, onRetry }) {
  const navigate = useNavigate();
  const safeMissingIntegrations = Array.isArray(missingIntegrations) ? missingIntegrations : [];

  const missingList = useMemo(() => {
    return safeMissingIntegrations.map(findIntegration).filter(Boolean);
  }, [safeMissingIntegrations]);

  if (!isOpen || safeMissingIntegrations.length === 0) return null;

  if (missingList.length === 0) {
    return (
      <ErrorState
        title="Workflow configuration missing"
        message="Step configuration could not be loaded."
        onClose={onClose}
      />
    );
  }

  const handleRetry = () => {
    onRetry?.();
  };

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/70" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.section
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0D1117] p-6 shadow-2xl"
        >
          <header>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Setup Required
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">
              Connect Missing Integrations
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Complete the following steps to enable one-click deployment
            </p>
          </header>

          <div className="mt-6 space-y-3">
            {missingList.map((integration) => (
              <div
                key={integration.id}
                className="rounded-xl border border-slate-700 bg-slate-900/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-sm font-semibold text-slate-100">
                    {integration?.icon || DefaultIcon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-100">{integration.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{integration.description}</p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Required for {integration.requiredFor}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(integration.route)}
                  className="mt-4 w-full rounded-lg bg-aurora px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                >
                  {integration.actionText}
                </button>
              </div>
            ))}
          </div>

          <footer className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
            >
              Retry Deploy
            </button>
          </footer>
        </motion.section>
      </div>
    </>
  );
}

export default function SetupWizard(props) {
  return (
    <SetupWizardErrorBoundary onClose={props.onClose}>
      <SetupWizardContent {...props} />
    </SetupWizardErrorBoundary>
  );
}
