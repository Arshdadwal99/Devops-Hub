/**
 * AI Service for Pipeline Log Analysis
 * Uses OpenAI API to analyze CI/CD logs and predict failures
 */

import OpenAI from "openai";

const analyzeLogsWithAI = async (logSummary, metrics) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

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
  "affected_stage": "<build|test|deploy|integration>",
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

  try {
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

    // Extract the text content from the response
    const content = response.choices[0].message.content;

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response as JSON");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Validate response structure
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
    console.error("AI Analysis Error:", error);
    throw new Error(`Failed to analyze logs with AI: ${error.message}`);
  }
};

/**
 * Fallback analysis when AI is unavailable
 * Uses heuristics based on log patterns
 */
const fallbackAnalysis = (logSummary, metrics) => {
  const totalIssues =
    metrics.errorCount +
    metrics.warningCount +
    metrics.failureCount;
  const failureProbability = Math.min(
    100,
    Math.floor((totalIssues / 10) * 100)
  );

  let severity = "Low";
  if (failureProbability > 75) severity = "Critical";
  else if (failureProbability > 50) severity = "High";
  else if (failureProbability > 25) severity = "Medium";

  const issues = [];
  if (metrics.errorCount > 0) issues.push("Errors detected in logs");
  if (metrics.failureCount > 0) issues.push("Test or build failures");
  if (metrics.timeoutCount > 0) issues.push("Timeout issues detected");
  if (metrics.warningCount > 0) issues.push("Deprecation or warning issues");

  return {
    failure_probability: failureProbability,
    severity,
    root_cause: issues.join(", ") || "No specific issues detected",
    explanation: `Analysis based on log patterns. Found ${totalIssues} potential issues.`,
    suggested_fixes: [
      "Review error logs for detailed error messages",
      "Check test output for failed assertions",
      "Verify timeout configurations and resource limits",
      "Update deprecated dependencies",
      "Increase verbosity for more detailed logs",
    ],
    affected_stage: metrics.failureCount > 0 ? "test" : "build",
    confidence: 60,
  };
};

export { analyzeLogsWithAI, fallbackAnalysis };
