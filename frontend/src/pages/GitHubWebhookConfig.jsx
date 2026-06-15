import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createGitHubWebhook,
  enableAutoDeploy,
  getAutoDeployStatus,
  getGitHubRepositories,
  getJenkinsConnectionStatus,
} from "../lib/api";

function getRepositoryParts(repository) {
  const htmlUrl = repository?.htmlUrl || repository?.url || "";
  const urlParts = htmlUrl.split("/").filter(Boolean);
  const owner = repository?.owner?.login || repository?.owner || urlParts[urlParts.length - 2] || "";
  const repo = repository?.name || urlParts[urlParts.length - 1] || "";

  return { owner, repo };
}

function buildWebhookUrl(jenkinsUrl) {
  const cleanUrl = String(jenkinsUrl || "").trim().replace(/\/+$/, "");
  return cleanUrl ? `${cleanUrl}/github-webhook/` : "";
}

export default function GitHubWebhookConfig() {
  const { repositoryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [jenkinsStatus, setJenkinsStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const repository = useMemo(
    () => repositories.find((repo) => String(repo.id) === String(repositoryId)),
    [repositories, repositoryId]
  );
  const { owner, repo } = getRepositoryParts(repository);
  const repositoryName = repository?.fullName || (owner && repo ? `${owner}/${repo}` : repository?.name || "");
  const jenkinsUrl = jenkinsStatus?.url || "";
  const webhookUrl = buildWebhookUrl(jenkinsUrl);
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    async function load() {
      if (!repositoryId) {
        setError("Repository id is required in the route.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [repoResponse, jenkinsResponse] = await Promise.all([
          getGitHubRepositories(),
          getJenkinsConnectionStatus(),
        ]);

        setRepositories(repoResponse.data?.repositories || []);
        setJenkinsStatus(jenkinsResponse.status || {});
      } catch (err) {
        setError(err.message || "Failed to load webhook configuration details.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [repositoryId]);

  useEffect(() => {
    if (loading || !repositoryId || repository) return;
    setError(`Repository ${repositoryId} was not found in your connected GitHub repositories.`);
  }, [loading, repository, repositoryId]);

  async function handleConfigure() {
    if (!repository) {
      setError("Repository not found. Return to GitHub Repositories and try again.");
      return;
    }

    if (!jenkinsStatus?.connected || !webhookUrl) {
      setError("Connect Jenkins before configuring the GitHub webhook.");
      return;
    }

    try {
      setConfiguring(true);
      setError("");
      setSuccess("");

      const response = await createGitHubWebhook({
        owner,
        repo,
        branch: repository.defaultBranch || "main",
        webhookUrl,
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to configure GitHub webhook.");
      }

      setSuccess("GitHub Webhook Configured");

      const deploymentId = response.deploymentId;
      const autoDeploy = await getAutoDeployStatus({
        owner,
        repo,
        branch: repository.defaultBranch || "main",
      });

      if (autoDeploy?.debug?.canEnableAutoDeploy && !autoDeploy?.autoDeploy?.enabled) {
        await enableAutoDeploy({
          deploymentId,
          owner,
          repo,
          branch: repository.defaultBranch || "main",
        });
      }

      if (returnTo) {
        navigate(returnTo, { replace: true });
        return;
      }

      if (deploymentId) {
        navigate(`/deployments/setup/${deploymentId}`, { replace: true });
        return;
      }

      setError("Webhook was configured, but no deployment workflow was found for this repository.");
    } catch (err) {
      setError(err.message || "Failed to configure GitHub webhook.");
    } finally {
      setConfiguring(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate("/github/repositories")}
        className="mb-5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        Back to repositories
      </button>

      <section className="rounded-lg border border-white/10 bg-slate-950 p-6">
        <div className="border-b border-white/10 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            GitHub Webhook
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Configure GitHub Webhook</h1>
          <p className="mt-2 text-sm text-slate-400">
            Connect GitHub push and pull request events to the Jenkins webhook endpoint.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-sm text-slate-300">Loading webhook configuration...</div>
        ) : (
          <div className="py-6">
            {error && (
              <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            )}

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <InfoRow label="Repository Name" value={repositoryName || "Not found"} />
              <InfoRow label="Repository ID" value={repositoryId || "Missing"} />
              <InfoRow label="Jenkins URL" value={jenkinsUrl || "Not connected"} />
              <InfoRow label="Webhook URL" value={webhookUrl || "Unavailable"} />
            </div>

            <button
              type="button"
              onClick={handleConfigure}
              disabled={configuring || !repository || !jenkinsStatus?.connected}
              className="mt-6 rounded-lg border border-cyan-300/30 bg-cyan-500/20 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {configuring ? "Configuring..." : "Configure Webhook"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-slate-200">{value}</div>
    </div>
  );
}
