/**
 * AI Service for Pipeline Log Analysis
 * Uses OpenAI API with fallback to rule-based analysis
 */

import OpenAI from "openai";

/**
 * Error patterns and rules for log analysis
 */
const LOG_PATTERNS = {
  errors: [
    /error/i,
    /fatal/i,
    /failed/i,
    /exception/i,
    /crash/i,
    /segmentation fault/i,
  ],
  warnings: [
    /warning/i,
    /deprecated/i,
    /warn/i,
    /caution/i,
  ],
  timeouts: [
    /timeout/i,
    /timed out/i,
    /deadline exceeded/i,
    /connection refused/i,
  ],
  memory: [
    /out of memory/i,
    /OOM/i,
    /memory exhausted/i,
    /heap space/i,
  ],
  network: [
    /connection refused/i,
    /connection timeout/i,
    /network unreachable/i,
    /dns.*failed/i,
  ],
  database: [
    /database connection failed/i,
    /db.*error/i,
    /query.*failed/i,
    /transaction.*failed/i,
  ],
  docker: [
    /container.*failed/i,
    /docker.*error/i,
    /image.*not found/i,
    /cannot start service/i,
  ],
};

/**
 * Extract patterns from logs
 */
const extractPatterns = (logs) => {
  const patterns = {
    errors: [],
    warnings: [],
    timeouts: [],
    memory: [],
    network: [],
    database: [],
    docker: [],
  };

  const logText = Array.isArray(logs) ? logs.join("\n") : logs;

  Object.entries(LOG_PATTERNS).forEach(([category, regexes]) => {
    regexes.forEach(regex => {
      const matches = logText.match(regex);
      if (matches) {
        patterns[category].push(matches[0]);
      }
    });
  });

  return patterns;
};

/**
 * Analyze logs with AI (OpenAI)
 */
export const analyzeLogsWithAI = async (logSummary, metrics) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ OPENAI_API_KEY not set, using fallback analysis");
    return fallbackAnalysis(logSummary, metrics);
  }

  try {
    const client = new OpenAI({ apiKey });

    const systemPrompt = `You are an expert DevOps AI assistant with deep knowledge of CI/CD pipelines, error analysis, and failure prediction.

Your responsibilities:
1. Analyze CI/CD logs and identify errors, warnings, and anomalies
2. Predict the probability of pipeline failure (0-100%)
3. Classify severity level (Low, Medium, High, Critical)
4. Identify the root cause of failures
5. Provide clear explanations and actionable fixes

Always respond with valid JSON in this exact format:
{
  "failure_probability": <number 0-100>,
  "severity": "<Low|Medium|High|Critical>",
  "root_cause": "<string explaining the root cause>",
  "explanation": "<string with detailed explanation>",
  "suggested_fixes": [<array of fix strings>],
  "affected_stage": "<build|test|deploy|integration|unknown>",
  "confidence": <number 0-100>
}`;

    const userPrompt = `Analyze these CI/CD logs and predict failure probability:

Log Summary:
${logSummary}

Error Metrics:
- Errors: ${metrics.errorCount}
- Warnings: ${metrics.warningCount}
- Failures: ${metrics.failureCount}
- Timeouts: ${metrics.timeoutCount}
- Test Issues: ${metrics.testCount}

Provide your analysis as valid JSON.`;

    const response = await client.chat.completions.create({
      model: "gpt-4-turbo-preview",
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response as JSON");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    if (
      typeof analysis.failure_probability !== "number" ||
      typeof analysis.severity !== "string" ||
      typeof analysis.root_cause !== "string" ||
      typeof analysis.explanation !== "string" ||
      !Array.isArray(analysis.suggested_fixes)
    ) {
      throw new Error("Invalid response structure from AI");
    }

    return analysis;
  } catch (error) {
    console.warn("⚠️ AI Analysis failed, using fallback:", error.message);
    return fallbackAnalysis(logSummary, metrics);
  }
};

/**
 * Rule-based fallback analysis
 */
export const fallbackAnalysis = (logs, metrics) => {
  const patterns = extractPatterns(logs);
  const metrics_ = metrics || {};

  const errorCount = metrics_.errorCount || 0;
  const warningCount = metrics_.warningCount || 0;
  const failureCount = metrics_.failureCount || 0;
  const timeoutCount = metrics_.timeoutCount || 0;

  let failureProbability = 30;
  let rootCause = "Unknown";
  let affectedStage = "build";

  // Analyze patterns
  if (patterns.memory.length > 0) {
    failureProbability = 95;
    rootCause = "Memory exhaustion detected";
  } else if (patterns.network.length > 0) {
    failureProbability = 85;
    rootCause = "Network connectivity issues";
  } else if (patterns.database.length > 0) {
    failureProbability = 80;
    rootCause = "Database connection or query failure";
    affectedStage = "integration";
  } else if (patterns.docker.length > 0) {
    failureProbability = 85;
    rootCause = "Docker container or image issues";
    affectedStage = "deploy";
  } else if (timeoutCount > 0) {
    failureProbability = 75;
    rootCause = "Process or connection timeout";
  } else if (failureCount > 0) {
    failureProbability = 70;
    rootCause = "Test or build execution failure";
    affectedStage = "test";
  } else if (errorCount > 0) {
    failureProbability = 60;
    rootCause = "Errors detected in logs";
  } else if (warningCount > 0) {
    failureProbability = 40;
    rootCause = "Warnings detected (deprecated dependencies or compatibility issues)";
  }

  let severity = "Low";
  if (failureProbability > 75) severity = "Critical";
  else if (failureProbability > 50) severity = "High";
  else if (failureProbability > 25) severity = "Medium";

  const suggestedFixes = [];
  
  if (patterns.memory.length > 0) {
    suggestedFixes.push("Increase heap memory allocation");
    suggestedFixes.push("Optimize memory usage in code");
    suggestedFixes.push("Run memory profiler to find leaks");
  } else if (patterns.network.length > 0) {
    suggestedFixes.push("Check network connectivity");
    suggestedFixes.push("Verify DNS resolution");
    suggestedFixes.push("Review firewall and security rules");
  } else if (patterns.database.length > 0) {
    suggestedFixes.push("Verify database connection string");
    suggestedFixes.push("Check database server status");
    suggestedFixes.push("Review database query performance");
  } else if (patterns.docker.length > 0) {
    suggestedFixes.push("Verify Docker image exists and is up to date");
    suggestedFixes.push("Check container resource limits");
    suggestedFixes.push("Review Docker daemon logs");
  } else {
    suggestedFixes.push("Review detailed error logs");
    suggestedFixes.push("Check test coverage and assertions");
    suggestedFixes.push("Verify environment configuration");
    suggestedFixes.push("Run local tests to reproduce issue");
  }

  return {
    failure_probability: failureProbability,
    severity,
    root_cause: rootCause,
    explanation: `Pattern-based analysis detected issues: ${Object.entries(patterns)
      .filter(([, v]) => v.length > 0)
      .map(([k]) => k)
      .join(", ") || "no specific patterns"}`,
    suggested_fixes: suggestedFixes,
    affected_stage: affectedStage,
    confidence: 70,
  };
};

/**
 * Analyze logs and store in database
 */
export const analyzeLogsComprehensive = async (logs, userId) => {
  try {
    const patterns = extractPatterns(logs);
    const logText = Array.isArray(logs) ? logs.join("\n") : logs;

    const metrics = {
      errorCount: patterns.errors.length,
      warningCount: patterns.warnings.length,
      failureCount: patterns.errors.length > 5 ? 3 : 1,
      timeoutCount: patterns.timeouts.length,
      testCount: (logText.match(/test/gi) || []).length,
    };

    const analysis = await analyzeLogsWithAI(logText.substring(0, 5000), metrics);

    return {
      success: true,
      analysis,
      patterns,
      metrics,
    };
  } catch (error) {
    console.error("❌ [AI] Error analyzing logs:", error.message);
    return {
      success: false,
      error: error.message,
      analysis: null,
    };
  }
};
