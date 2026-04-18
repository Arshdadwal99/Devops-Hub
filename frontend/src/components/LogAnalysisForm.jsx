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

      const data = await api("/analyze-logs", {
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
      setError(err.message || "Failed to analyze logs. Please try again.");
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
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
    >
      {/* Header */}
      <h3 className="text-xl font-bold text-gray-900 mb-4">
        Log Analysis for Failure Prediction
      </h3>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"
        >
          <p className="font-semibold">Analysis Failed</p>
          <p className="text-sm mt-1">{error}</p>
        </motion.div>
      )}

      {/* Form */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* Pipeline ID Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Pipeline ID (Optional)
            </label>
            <input
              type="text"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              placeholder="e.g., deploy-prod, test-main"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Logs Textarea */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              CI/CD Logs
            </label>
            <textarea
              value={logs}
              onChange={(e) => setLogs(e.target.value)}
              placeholder="Paste your CI/CD logs here. Include errors, warnings, and test output..."
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm transition-all resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum 1MB. Logs are analyzed for errors, warnings, failures,
              timeouts, and test results.
            </p>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Tip:</span> Include full log
              output from your CI/CD pipeline for better accuracy. The AI will
              analyze for errors, warnings, timeouts, and test failures.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
          className="space-y-4"
        >
          <AnalysisPrediction analysis={analysis} />

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReset}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
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
              className="bg-green-200 hover:bg-green-300 text-green-800 font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
            >
              Download Report
            </motion.button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
