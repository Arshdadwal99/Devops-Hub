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

  // Determine color based on severity
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
        return "from-gray-500 to-gray-700";
    }
  };

  const getSeverityBgColor = (severity) => {
    switch (severity) {
      case "Critical":
        return "bg-red-100 border-red-300";
      case "High":
        return "bg-orange-100 border-orange-300";
      case "Medium":
        return "bg-yellow-100 border-yellow-300";
      case "Low":
        return "bg-green-100 border-green-300";
      default:
        return "bg-gray-100 border-gray-300";
    }
  };

  const getSeverityTextColor = (severity) => {
    switch (severity) {
      case "Critical":
        return "text-red-700";
      case "High":
        return "text-orange-700";
      case "Medium":
        return "text-yellow-700";
      case "Low":
        return "text-green-700";
      default:
        return "text-gray-700";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-900">
          Pipeline Failure Prediction
        </h3>
        <span className="text-sm text-gray-500">
          {new Date(analysis.timestamp).toLocaleDateString()}
        </span>
      </div>

      {/* Failure Probability */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-gray-700">
            Failure Probability
          </label>
          <span className="text-2xl font-bold text-gray-900">
            {analysis.failure_probability}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
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
      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-2">Severity</p>
        <div className={`inline-block px-4 py-2 rounded-lg border-2 ${getSeverityBgColor(
          analysis.severity
        )} ${getSeverityTextColor(analysis.severity)}`}>
          <span className="font-bold">{analysis.severity}</span>
        </div>
      </div>

      {/* Affected Stage */}
      {analysis.affected_stage && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Affected Stage
          </p>
          <div className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-sm font-medium">
            {analysis.affected_stage.charAt(0).toUpperCase() +
              analysis.affected_stage.slice(1)}
          </div>
        </div>
      )}

      {/* Confidence Score */}
      {analysis.confidence && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">
              Analysis Confidence
            </label>
            <span className="text-lg font-bold text-gray-900">
              {analysis.confidence}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${analysis.confidence}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-blue-500 rounded-full"
            />
          </div>
        </div>
      )}

      {/* Root Cause */}
      <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
        <p className="text-sm font-semibold text-gray-700 mb-2">Root Cause</p>
        <p className="text-gray-800 font-medium">{analysis.root_cause}</p>
      </div>

      {/* Explanation */}
      <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm font-semibold text-blue-900 mb-2">Details</p>
        <p className="text-blue-800 text-sm leading-relaxed">
          {analysis.explanation}
        </p>
      </div>

      {/* Suggested Fixes */}
      {analysis.suggested_fixes && analysis.suggested_fixes.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Suggested Fixes ({analysis.suggested_fixes.length})
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
                  className="w-full text-left bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-3 transition-colors duration-200"
                >
                  <div className="flex items-center">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                      {index + 1}
                    </span>
                    <span className="text-green-800 font-medium">
                      {fix}
                    </span>
                    <span className="ml-auto text-green-600">
                      {expandedFix === index ? "−" : "+"}
                    </span>
                  </div>
                </button>
                {expandedFix === index && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-green-50 border-l-4 border-green-500 p-3 mt-1 text-sm text-green-700"
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
        <div className="text-xs text-gray-500 bg-gray-50 rounded p-3 border border-gray-200">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-semibold">Processing Time:</span>{" "}
              {analysis.metadata.processingTime}ms
            </div>
            <div>
              <span className="font-semibold">Analysis ID:</span>{" "}
              {analysis.metadata.analysisId?.slice(0, 8)}...
            </div>
            {analysis.metadata.usedFallback && (
              <div className="col-span-2 text-yellow-600">
                ⚠️ Using fallback analysis (AI service unavailable)
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
