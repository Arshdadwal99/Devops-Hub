import { useEffect, useState } from "react";

export default function JenkinsfilePreviewModal({
  isOpen,
  preview,
  repository,
  loading = false,
  error = "",
  onClose,
  onGenerate,
}) {
  const [jenkinsfile, setJenkinsfile] = useState("");

  useEffect(() => {
    setJenkinsfile(preview?.jenkinsfile || "");
  }, [preview]);

  if (!isOpen) return null;

  const runtime = preview?.runtime || {};
  const config = preview?.configuration || {};

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/70 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Generate Jenkins Pipeline</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-100">
                {repository?.name || preview?.repo || "Repository"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">Preview Jenkinsfile before saving</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Close
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-aurora" />
                  <p className="text-sm text-slate-300">Detecting stack and generating Jenkinsfile...</p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {error}
              </div>
            ) : preview ? (
              <div className="grid gap-5 lg:grid-cols-[0.35fr_0.65fr]">
                <aside className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Detected Project</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-100">{preview.projectType}</h3>
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <Info label="Install" value={runtime.installCommand} />
                      <Info label="Tests" value={runtime.testCommand} />
                      <Info label="Docker Hub" value={`${config.dockerHub?.username || "connected"} / ${config.dockerHub?.credentialsId || "credentials"}`} />
                      <Info label="EC2" value={`${config.ec2?.username || "user"}@${config.ec2?.host || "host"}:${config.ec2?.port || runtime.appPort || 3000}`} />
                      <Info label="SSH Credential" value={config.ec2?.sshCredentialsId} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                    <p className="text-sm font-semibold text-emerald-200">Jenkins Pipeline Generated ✅</p>
                    <div className="mt-3 space-y-2 text-sm text-emerald-100/90">
                      {(preview.stages || []).map((stage) => (
                        <div key={stage} className="rounded-lg border border-emerald-300/10 bg-emerald-500/10 px-3 py-2">
                          {stage}
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>

                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{preview.path}</p>
                    <p className="text-xs text-slate-500">Declarative pipeline for {preview.branch || "main"}</p>
                  </div>
                  <textarea
                    value={jenkinsfile}
                    onChange={(event) => setJenkinsfile(event.target.value)}
                    className="h-44 w-full resize-y rounded-xl border border-white/10 bg-slate-900 p-4 font-mono text-xs text-slate-200 outline-none transition focus:border-aurora/50"
                    spellCheck="false"
                  />
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <pre className="max-h-[420px] overflow-auto bg-slate-900 p-4 text-xs leading-5 text-slate-200">
                      <code>{jenkinsfile}</code>
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-slate-900/70 px-6 py-4">
            <p className="text-xs text-slate-500">Saved Jenkinsfile will be committed to GitHub and stored in DevOps Hub.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onGenerate?.(jenkinsfile)}
                disabled={!preview || loading}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Jenkinsfile"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 break-words font-mono text-xs text-slate-200">{value || "Not detected"}</div>
    </div>
  );
}
