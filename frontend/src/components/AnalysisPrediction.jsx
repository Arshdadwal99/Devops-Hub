import { useState } from "react";
import { motion } from "framer-motion";

/**
 * AnalysisPrediction Component
 * Displays AI-based failure prediction analysis results
 */
export default function AnalysisPrediction({ analysis, loading = false }) {
  const [expandedFix, setExpandedFix] = useState(null);

  if (!analysis) {
    return null;
  }

  // Determine color based on severity - using dark theme
  const getSeverityColor = (severity) => {
    switch (severity) {
      case "Critical":
        return "from-red-500 to-red-700";
      case "High":
        return "from-orange-500 to-orange-700";
      case "Medium":
        return "from-yellow-500 to-yellow-700";
      case "Low":
        return "from-green-500 to-green-700";
      default:
        return "from-slate-500 to-slate-700";
    }
  };

  const getSeverityBgColor = (severity) => {
    switch (severity) {
      case "Critical":
        return "bg-red-500/10 border-red-500/30";
      case "High":
        return "bg-orange-500/10 border-orange-500/30";
      case "Medium":
        return "bg-yellow-500/10 border-yellow-500/30";
      case "Low":
        return "bg-green-500/10 border-green-500/30";
      default:
        return "bg-slate-500/10 border-slate-500/30";
    }
  };

  const getSeverityTextColor = (severity) => {
    switch (severity) {
      case "Critical":
        return "text-red-300";
      case "High":
        return "text-orange-300";
      case "Medium":
        return "text-yellow-300";
      case "Low":
        return "text-green-300";
      default:
        return "text-slate-300";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">
          📊 Analysis Results
        </h3>
        <span className="text-xs text-slate-400">
          {new Date(analysis.timestamp).toLocaleDateString()}
        </span>
      </div>

      {/* Failure Probability */}
      <div className="rounded-xl bg-slate-900/30 border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-slate-200">
            Failure Probability
          </label>
          <span className="text-3xl font-bold text-white">
            {analysis.failure_probability}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${analysis.failure_probability}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={`h-full bg-gradient-to-r ${getSeverityColor(
              analysis.severity
            )}`}
          />
        </div>
      </div>

      {/* Severity Badge */}
      <div>
        <p className="text-sm font-semibold text-slate-300 mb-3">Severity Level</p>
        <div className={`inline-block px-4 py-2 rounded-lg border-2 ${getSeverityBgColor(
          analysis.severity
        )} ${getSeverityTextColor(analysis.severity)}`}>
          <span className="font-bold">{analysis.severity}</span>
        </div>
      </div>

      {/* Affected Stage */}
      {analysis.affected_stage && (
        <div className="rounded-xl bg-slate-900/30 border border-white/10 p-4">
          <p className="text-sm font-semibold text-slate-300 mb-2">
            Affected Stage
          </p>
          <div className="inline-block bg-aurora/20 text-aurora px-3 py-1 rounded-lg text-sm font-medium border border-aurora/30">
            {analysis.affected_stage.charAt(0).toUpperCase() +
              analysis.affected_stage.slice(1)}
          </div>
        </div>
      )}

      {/* Confidence Score */}
      {analysis.confidence && (
        <div className="rounded-xl bg-slate-900/30 border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-slate-200">
              Analysis Confidence
            </label>
            <span className="text-2xl font-bold text-white">
              {analysis.confidence}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${analysis.confidence}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-aurora rounded-full"
            />
          </div>
        </div>
      )}

      {/* Root Cause */}
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-5">
        <p className="text-sm font-semibold text-red-300 mb-2">🎯 Root Cause</p>
        <p className="text-slate-100 font-medium">{analysis.root_cause}</p>
      </div>

      {/* Explanation */}
      <div className="rounded-xl bg-aurora/10 border border-aurora/30 p-5">
        <p className="text-sm font-semibold text-aurora mb-2">💡 Details</p>
        <p className="text-slate-200 text-sm leading-relaxed">
          {analysis.explanation}
        </p>
      </div>

      {/* Suggested Fixes */}
      {analysis.suggested_fixes && analysis.suggested_fixes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-3">
            🔧 Suggested Fixes ({analysis.suggested_fixes.length})
          </p>
          <div className="space-y-2">
            {analysis.suggested_fixes.map((fix, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <button
                  onClick={() =>
                    setExpandedFix(expandedFix === index ? null : index)
                  }
                  className="w-full text-left bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 transition-colors duration-200"
                >
                  <div className="flex items-center">
                    <span className="flex-shrink-0 w-6 h-6 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center text-sm font-bold mr-3">
                      {index + 1}
                    </span>
                    <span className="text-emerald-300 font-medium">
                      {fix}
                    </span>
                    <span className="ml-auto text-emerald-400">
                      {expandedFix === index ? "−" : "+"}
                    </span>
                  </div>
                </button>
                {expandedFix === index && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-emerald-500/5 border-l-4 border-emerald-500 p-3 mt-1 text-sm text-emerald-300"
                  >
                    <p>
                      This suggestion helps address the identified issue and
                      improve pipeline reliability.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {analysis.metadata && (
        <div className="text-xs text-slate-400 bg-slate-900/30 rounded-lg p-3 border border-white/10">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold text-slate-300">Processing Time:</span>{" "}
              {analysis.metadata.processingTime}ms
            </div>
            <div>
              <span className="font-semibold text-slate-300">Analysis ID:</span>{" "}
              {analysis.metadata.analysisId?.slice(0, 8)}...
            </div>
            {analysis.metadata.usedFallback && (
              <div className="col-span-2 text-yellow-400">
                ⚠️ Using fallback analysis (AI service unavailable)
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
