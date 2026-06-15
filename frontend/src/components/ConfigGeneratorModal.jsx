import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function ConfigGeneratorModal({
  configPreview,
  isOpen,
  onClose,
  onAccept,
  onEdit,
  loading = false,
}) {
  const [activeTab, setActiveTab] = useState("dockerfile");
  const [editingContent, setEditingContent] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen || !configPreview) return null;

  const configs = configPreview.configs || {};
  const currentConfig = configs[activeTab];

  if (!currentConfig || currentConfig.status === "skipped") {
    const availableConfigs = Object.entries(configs)
      .filter(([_, config]) => config.status !== "skipped")
      .map(([key]) => key);

    if (availableConfigs.length === 0) {
      return (
        <>
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 backdrop-blur-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-white/10 bg-slate-800/50 px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-100">Generation Complete</h2>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-200 transition"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6">
                <div className="text-center">
                  <div className="text-6xl mb-4">✅</div>
                  <p className="text-slate-300 mb-4">All configurations are already present in the repository.</p>
                  <p className="text-slate-400 text-sm">No additional files need to be generated.</p>
                </div>
              </div>

              <div className="border-t border-white/10 bg-slate-800/50 px-6 py-4 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }

    setActiveTab(availableConfigs[0]);
  }

  const fileNames = {
    dockerfile: "Dockerfile",
    jenkinsfile: "Jenkinsfile",
    dockerignore: ".dockerignore",
    githubActions: ".github/workflows/ci.yml",
  };

  return (
    <>
      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900 backdrop-blur-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 bg-slate-800/50 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">Configuration Generator</h2>
              <p className="mt-1 text-sm text-slate-400">
                Review and accept generated configuration files
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition"
              aria-label="Close"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[75vh] overflow-y-auto">
            {/* Tabs */}
            <div className="border-b border-white/10 bg-slate-800/30 sticky top-0 px-6 py-3">
              <div className="flex gap-2 overflow-x-auto">
                {Object.entries(configs).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    disabled={config.status === "skipped"}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap ${
                      activeTab === key
                        ? "bg-aurora text-slate-900"
                        : config.status === "skipped"
                        ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                        : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                    }`}
                  >
                    <span className="inline-block mr-2">
                      {config.status === "generated"
                        ? "✅"
                        : config.status === "error"
                        ? "❌"
                        : "⊘"}
                    </span>
                    {fileNames[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Config Content */}
            {currentConfig && currentConfig.status !== "skipped" && (
              <div className="p-6 space-y-4">
                {/* File Info */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{fileNames[activeTab]}</h3>
                    {currentConfig.reason && (
                      <p className="mt-1 text-sm text-slate-400">{currentConfig.reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {currentConfig.status === "error" && (
                      <span className="px-3 py-1 rounded-lg bg-red-500/20 text-red-200 text-sm font-medium">
                        Error
                      </span>
                    )}
                    {currentConfig.status === "generated" && (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 text-sm font-medium">
                        Generated
                      </span>
                    )}
                  </div>
                </div>

                {/* Code Editor or Error Message */}
                {isEditing ? (
                  <div className="space-y-2">
                    <label className="text-sm text-slate-300 font-medium">Edit Content</label>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="w-full h-96 p-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-sm focus:outline-none focus:border-aurora resize-none"
                      spellCheck="false"
                    />
                  </div>
                ) : currentConfig.content ? (
                  <div className="rounded-lg overflow-hidden border border-white/10">
                    <SyntaxHighlighter
                      language={currentConfig.language || "text"}
                      style={oneDark}
                      customStyle={{
                        margin: 0,
                        backgroundColor: "#1e293b",
                        fontSize: "12px",
                        maxHeight: "400px",
                        overflow: "auto",
                      }}
                      wrapLongLines
                    >
                      {currentConfig.content}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400">
                    <p>Error: {currentConfig.reason || "No content available"}</p>
                  </div>
                )}
              </div>
            )}

            {currentConfig && currentConfig.status === "skipped" && (
              <div className="p-6">
                <div className="rounded-lg border border-white/10 bg-slate-800/50 p-4 text-center">
                  <p className="text-slate-400 mb-2">⊘ Skipped</p>
                  <p className="text-sm text-slate-500">{currentConfig.reason || "This file was skipped"}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 bg-slate-800/50 px-6 py-4 flex justify-between items-center">
            <div className="text-xs text-slate-500">
              Tech Stack: <span className="text-slate-300 font-mono">{configPreview.techStack}</span>
            </div>
            <div className="flex gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditingContent(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      onEdit?.(activeTab, editingContent);
                      setIsEditing(false);
                      setEditingContent(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition"
                  >
                    Save Edit
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium transition"
                  >
                    Cancel
                  </button>
                  {currentConfig && currentConfig.status === "generated" && (
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setEditingContent(currentConfig.content);
                      }}
                      className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium transition"
                    >
                      ✏️ Edit
                    </button>
                  )}
                  <button
                    onClick={() => onAccept?.(configPreview)}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-emerald-600" />
                        Accepting...
                      </span>
                    ) : (
                      "✅ Accept All"
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
