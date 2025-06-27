const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

/**
 * Logger configuration using Winston
 * - Logs errors to error.log
 * - Logs all levels to combined.log
 * - Logs to console with colors
 * - Uses JSON format for file logs
 * - Uses human-readable format for console logs
 */

// Define log directory and files
const logsDir = path.join(__dirname, '../../logs');
const combinedLog = path.join(logsDir, 'combined.log');
const errorLog = path.join(logsDir, 'error.log');

// Ensure log directory and files exist
fs.ensureDirSync(logsDir);
fs.ensureFileSync(combinedLog);
fs.ensureFileSync(errorLog);

// Create custom format for file logs (JSON with metadata)
const fileFormat = winston.format.combine(
  winston.format.uncolorize(),
  winston.format.timestamp(),
  winston.format.json()
);

// Create custom format for console logs (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    // Format metadata as a string if present
    let metaString = '';
    if (Object.keys(metadata).length > 0) {
      // Keep metadata output concise for console
      const importantKeys = ['error', 'jobIdentifier', 'status', 'code', 'recordCount', 'jobSid', 'friendlyName'];
      const relevantMeta = {};
      importantKeys.forEach(key => {
        if (metadata[key] !== undefined) {
          relevantMeta[key] = metadata[key];
        }
      });
      
      // Add any error details in a structured way
      if (metadata.error && typeof metadata.error === 'object') {
        relevantMeta.errorCode = metadata.error.code || metadata.error.status;
        relevantMeta.errorMessage = metadata.error.message;
      }
      
      if (Object.keys(relevantMeta).length > 0) {
        metaString = ` | ${JSON.stringify(relevantMeta)}`;
      }
    }
    return `[${timestamp}] ${level}: ${message}${metaString}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // Allow setting log level via environment variable
  transports: [
    // Error log file
    new winston.transports.File({
      filename: errorLog,
      level: 'error',
      format: fileFormat,
      options: { flags: 'a' } // Append mode
    }),
    // Combined log file
    new winston.transports.File({
      filename: combinedLog,
      format: fileFormat,
      options: { flags: 'a' } // Append mode
    }),
    // Console output
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  // Don't exit on uncaught exceptions
  exitOnError: false
});

// Export logger
module.exports = logger;
