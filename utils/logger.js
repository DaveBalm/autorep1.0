/**
 * Simple logger utility using console.log.
 * TODO: Replace with a more robust logging library like Winston or Pino for production.
 */

const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};

module.exports = logger;
