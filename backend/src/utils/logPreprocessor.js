/**
 * Log Preprocessing Utility
 * Extracts important error lines from CI/CD logs before AI analysis
 */

export const preprocessLogs = (logs) => {
  if (!logs) return "";

  const logsText = typeof logs === "string" ? logs : JSON.stringify(logs);
  const lines = logsText.split("\n");

  const importantLines = [];
  const errorPatterns = [
    /error/i,
    /failed/i,
    /failure/i,
    /exception/i,
    /critical/i,
    /fatal/i,
    /timeout/i,
    /warning/i,
    /deprecated/i,
    /vulnerability/i,
    /cannot find/i,
    /does not exist/i,
    /permission denied/i,
    /connection refused/i,
    /out of memory/i,
    /stack overflow/i,
    /segmentation fault/i,
    /undefined/i,
    /null reference/i,
    /assertion failed/i,
    /test failed/i,
    /build failed/i,
    /deploy failed/i,
  ];

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    // Check if line contains error patterns
    const hasError = errorPatterns.some((pattern) => pattern.test(line));

    if (hasError) {
      // Include context (previous and next lines)
      importantLines.push({
        lineNumber: index + 1,
        content: line.trim(),
        context: {
          previous:
            index > 0 ? lines[index - 1].trim() : null,
          next: index < lines.length - 1 ? lines[index + 1].trim() : null,
        },
      });
    }
  });

  // Remove duplicates and limit to last 50 important lines
  const uniqueLines = [
    ...new Map(
      importantLines.map((item) => [item.content, item])
    ).values(),
  ].slice(-50);

  return {
    totalLines: lines.length,
    importantLines: uniqueLines,
    summary: uniqueLines
      .map((line) => `Line ${line.lineNumber}: ${line.content}`)
      .join("\n"),
  };
};

/**
 * Extract metrics from logs
 */
export const extractMetrics = (logs) => {
  const logsText = typeof logs === "string" ? logs : JSON.stringify(logs);

  const metrics = {
    errorCount: (logsText.match(/error/gi) || []).length,
    warningCount: (logsText.match(/warning/gi) || []).length,
    failureCount: (logsText.match(/failed?/gi) || []).length,
    timeoutCount: (logsText.match(/timeout/gi) || []).length,
    testCount: (logsText.match(/test/gi) || []).length,
  };

  return metrics;
};

/**
 * Sanitize logs for security
 */
export const sanitizeLogs = (logs) => {
  let sanitized =
    typeof logs === "string" ? logs : JSON.stringify(logs);

  // Remove sensitive patterns
  sanitized = sanitized.replace(/password[:\s]*[^\s]+/gi, "password:***");
  sanitized = sanitized.replace(/api[_-]?key[:\s]*[^\s]+/gi, "api_key:***");
  sanitized = sanitized.replace(/token[:\s]*[^\s]+/gi, "token:***");
  sanitized = sanitized.replace(/secret[:\s]*[^\s]+/gi, "secret:***");
  sanitized = sanitized.replace(
    /authorization[:\s]*[^\s]+/gi,
    "authorization:***"
  );

  return sanitized;
};
