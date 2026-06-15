import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyzeRepository,
  getGitHubRepositories,
} from "../lib/api";
import RepositoryAnalysisModal from "../components/RepositoryAnalysisModal";
import OneClickDeploymentFlow from "../components/OneClickDeploymentFlow";

export default function GitHubRepositories() {
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [analyzingRepoId, setAnalyzingRepoId] = useState(null);
  const [deployingRepoId, setDeployingRepoId] = useState(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [deploymentFlowOpen, setDeploymentFlowOpen] = useState(false);

  useEffect(() => {
    fetchRepositories();
  }, []);

  async function fetchRepositories() {
    try {
      setLoading(true);
      setError("");
      const response = await getGitHubRepositories();
      setRepositories(response.data.repositories || []);
    } catch (err) {
      console.error("Failed to fetch repositories:", err);
      setError(err.message || "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(repository) {
    try {
      setAnalyzingRepoId(repository.id);
      setSelectedRepo(repository);
      setError("");

      const urlParts = repository.htmlUrl.split("/");
      const owner = urlParts[urlParts.length - 2];
      const repo = urlParts[urlParts.length - 1];
      const response = await analyzeRepository(owner, repo);

      if (response.success && response.data) {
        setAnalysisResults(response.data);
        setAnalysisModalOpen(true);
      } else {
        setError("Failed to analyze repository");
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setError(err.message || "Failed to analyze repository");
    } finally {
      setAnalyzingRepoId(null);
    }
  }

  function handleDeployWithCicd(repository) {
    setSelectedRepo(repository);
    setDeployingRepoId(repository.id);
    setDeploymentFlowOpen(true);
  }

  function handleDeploymentClose() {
    setDeploymentFlowOpen(false);
    setDeployingRepoId(null);
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-aurora" />
            <p className="text-slate-300">Loading repositories...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            onClick={() => navigate("/integrations")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            Back to integrations
          </button>
          <h1 className="text-4xl font-bold text-slate-100">Deploy a Repository</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Pick a GitHub repository. DevOps Hub handles the CI/CD setup, credentials, pipeline, and deployment behind the scenes.
          </p>
        </div>
        <button
          onClick={fetchRepositories}
          className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {repositories.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-slate-950 p-12 text-center">
          <h3 className="text-lg font-semibold text-slate-300">No Repositories Found</h3>
          <p className="mt-2 text-slate-400">
            Connect GitHub or refresh the repository list to start a deployment.
          </p>
          <button
            onClick={fetchRepositories}
            className="mt-4 inline-block rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
          >
            Refresh Repositories
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {repositories.map((repository) => (
            <RepositoryCard
              key={repository.id}
              repository={repository}
              analyzing={analyzingRepoId === repository.id}
              deploying={deployingRepoId === repository.id}
              onAnalyze={() => handleAnalyze(repository)}
              onDeploy={() => handleDeployWithCicd(repository)}
            />
          ))}
        </div>
      )}

      {analysisModalOpen && (
        <RepositoryAnalysisModal
          isOpen={analysisModalOpen}
          repository={selectedRepo}
          results={analysisResults}
          onClose={() => {
            setAnalysisModalOpen(false);
            setSelectedRepo(null);
            setAnalysisResults(null);
          }}
        />
      )}

      {deploymentFlowOpen && selectedRepo && (
        <OneClickDeploymentFlow
          isOpen={deploymentFlowOpen}
          repository={selectedRepo}
          onClose={handleDeploymentClose}
          onDeploymentStart={(deploymentId) => {
            console.log("Deployment started:", deploymentId);
          }}
          onDeploymentComplete={(deployment) => {
            console.log("Deployment complete:", deployment);
          }}
        />
      )}
    </main>
  );
}

function RepositoryCard({ repository, analyzing, deploying, onAnalyze, onDeploy }) {
  return (
    <article className="flex min-h-[260px] flex-col rounded-lg border border-slate-800 bg-slate-950 p-5 transition hover:border-slate-600 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repository.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-lg font-semibold text-slate-100 transition hover:text-aurora"
          >
            {repository.name}
          </a>
          <p className="mt-1 text-xs text-slate-500">
            {repository.visibility || "public"} repository
          </p>
        </div>
        {repository.language && (
          <span className="shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-300">
            {repository.language}
          </span>
        )}
      </div>

      <p className="mt-4 line-clamp-3 min-h-[60px] text-sm leading-6 text-slate-400">
        {repository.description || "No description available."}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
        <RepoStat label="Branch" value={repository.defaultBranch || "main"} />
        <RepoStat label="Stars" value={repository.stars || 0} />
        <RepoStat label="Forks" value={repository.forks || 0} />
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Updated {repository.updatedAt ? new Date(repository.updatedAt).toLocaleDateString() : "unknown"}
      </div>

      <div className="mt-auto flex gap-2 pt-5">
        <button
          onClick={onAnalyze}
          disabled={analyzing || deploying}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze"}
        </button>
        <button
          onClick={onDeploy}
          disabled={analyzing || deploying}
          className="flex-1 rounded-lg bg-aurora px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deploying ? "Starting..." : "Deploy with CI/CD"}
        </button>
      </div>
    </article>
  );
}

function RepoStat({ label, value }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="truncate text-slate-500">{label}</div>
      <div className="mt-1 truncate font-semibold text-slate-200">{value}</div>
    </div>
  );
}
