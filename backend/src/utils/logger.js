/**
 * Logger utility
 * Provides consistent logging across the application
 */

const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
};

class Logger {
  constructor(serviceName = "DevOpsHub") {
    this.serviceName = serviceName;
    this.level = process.env.LOG_LEVEL || "INFO";
  }

  timestamp() {
    return new Date().toISOString();
  }

  formatLog(level, message, data = {}) {
    return {
      timestamp: this.timestamp(),
      service: this.serviceName,
      level,
      message,
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  }

  error(message, data) {
    const log = this.formatLog(LOG_LEVELS.ERROR, message, data);
    console.error(`[${log.service}] ${log.level}:`, message, data);
    return log;
  }

  warn(message, data) {
    const log = this.formatLog(LOG_LEVELS.WARN, message, data);
    console.warn(`[${log.service}] ${log.level}:`, message, data);
    return log;
  }

  info(message, data) {
    const log = this.formatLog(LOG_LEVELS.INFO, message, data);
    console.log(`[${log.service}] ${log.level}:`, message, data);
    return log;
  }

  debug(message, data) {
    const log = this.formatLog(LOG_LEVELS.DEBUG, message, data);
    if (process.env.DEBUG === "true" || this.level === LOG_LEVELS.DEBUG) {
      console.debug(`[${log.service}] ${log.level}:`, message, data);
    }
    return log;
  }
}

export const logger = new Logger("DevOpsHub");
