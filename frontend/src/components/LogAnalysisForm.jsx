import { useState } from "react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import AnalysisPrediction from "./AnalysisPrediction";

/**
 * LogAnalysisForm Component
 * Allows users to submit logs for AI-based failure prediction
 */
export default function LogAnalysisForm() {
  const [logs, setLogs] = useState("");
  const [pipelineId, setPipelineId] = useState("default");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!logs.trim()) {
        setError("Please provide logs to analyze");
        setLoading(false);
        return;
      }

      const data = await api("/analyze", {
        method: "POST",
        body: JSON.stringify({
          logs: logs.trim(),
          pipelineId: pipelineId || "default",
        }),
      });

      setAnalysis({
        ...data.analysis,
        metadata: data.metadata,
        timestamp: new Date(),
      });
      setShowForm(false);
    } catch (err) {
      const errorMsg = err.response?.data?.message || 
                       err.message || 
                       "Failed to analyze logs. Please try again.";
      setError(errorMsg);
      console.error("Analysis error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setLogs("");
    setPipelineId("default");
    setAnalysis(null);
    setError(null);
    setShowForm(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-2xl border border-white/10 bg-slate-950/50 backdrop-blur-xl p-8"
    >
      {/* Header */}
      <h3 className="text-2xl font-bold text-white mb-6">
        🔍 Log Analysis for Failure Prediction
      </h3>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
        >
          <p className="font-semibold text-red-300">Analysis Failed</p>
          <p className="text-sm mt-2 text-red-200">{error}</p>
        </motion.div>
      )}

      {/* Form */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          {/* Pipeline ID Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              Pipeline ID (Optional)
            </label>
            <input
              type="text"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              placeholder="e.g., deploy-prod, test-main"
              className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:border-aurora/50 focus:bg-slate-900/80 transition-all"
            />
          </div>

          {/* Logs Textarea */}
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-2">
              CI/CD Logs
            </label>
            <textarea
              value={logs}
              onChange={(e) => setLogs(e.target.value)}
              placeholder="Paste your CI/CD logs here. Include errors, warnings, and test output..."
              rows={12}
              className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl text-slate-100 placeholder-slate-400 font-mono text-sm focus:outline-none focus:border-aurora/50 focus:bg-slate-900/80 transition-all resize-none"
            />
            <p className="text-xs text-slate-400 mt-2">
              Maximum 1MB. Logs are analyzed for errors, warnings, failures, timeouts, and test results.
            </p>
          </div>

          {/* Help Text */}
          <div className="rounded-xl border border-aurora/20 bg-aurora/5 p-4">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-aurora">💡 Tip:</span> Include full log output from your CI/CD pipeline for better accuracy.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-aurora to-aurora/80 hover:from-aurora/90 hover:to-aurora/70 disabled:from-aurora/40 disabled:to-aurora/30 text-slate-950 font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Analyze Logs
                </>
              )}
            </motion.button>
          </div>
        </motion.form>
      )}

      {/* Analysis Result */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <AnalysisPrediction analysis={analysis} />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReset}
              className="bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-white/10"
            >
              Analyze New Logs
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const json = JSON.stringify(analysis, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `analysis-${Date.now()}.json`;
                a.click();
              }}
              className="bg-gradient-to-r from-emerald-600/20 to-emerald-500/20 hover:from-emerald-600/30 hover:to-emerald-500/30 text-emerald-200 font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-emerald-500/30"
            >
              📥 Download Report
            </motion.button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
