import { useState } from "react";
import { deployGitHubRepository } from "../lib/api";

const defaultForm = {
  repoUrl: "",
  branch: "main",
  containerName: "",
  dockerfilePath: "docker-compose.yml",
  ports: "3000:3000",
  environment: "production",
};

export default function GitHubAutoDeploy({ onDeployed }) {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await deployGitHubRepository({
        ...form,
        ports: form.ports.split(",").map((port) => port.trim()).filter(Boolean),
      });
      setResult(data);
      onDeployed?.(data);
    } catch (deployError) {
      setError(deployError.data?.error || deployError.message || "GitHub deployment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Automatic Pipeline</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-slate-100">GitHub Actions Auto Deploy</h2>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="mb-2 block text-sm font-semibold text-slate-300">GitHub Repository URL</span>
          <input
            type="url"
            required
            value={form.repoUrl}
            onChange={(event) => updateField("repoUrl", event.target.value)}
            placeholder="https://github.com/owner/repo.git"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-aurora"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-300">Branch</span>
          <input
            type="text"
            value={form.branch}
            onChange={(event) => updateField("branch", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-aurora"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-300">Container Name</span>
          <input
            type="text"
            value={form.containerName}
            onChange={(event) => updateField("containerName", event.target.value)}
            placeholder="defaults to repository name"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-aurora"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-300">Build File Path</span>
          <input
            type="text"
            value={form.dockerfilePath}
            onChange={(event) => updateField("dockerfilePath", event.target.value)}
            placeholder="Dockerfile or docker-compose.yml"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-aurora"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-300">Ports (host:container)</span>
          <input
            type="text"
            value={form.ports}
            onChange={(event) => updateField("ports", event.target.value)}
            placeholder="3000:3000"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-aurora"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-300">Environment</span>
          <select
            value={form.environment}
            onChange={(event) => updateField("environment", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-aurora"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-aurora px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating Pipeline..." : "Generate CI/CD Pipeline"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {result?.success && (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          CI/CD pipeline configured. Future GitHub pushes will trigger deployment automatically.
        </div>
      )}
    </div>
  );
}
