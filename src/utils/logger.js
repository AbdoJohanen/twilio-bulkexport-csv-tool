const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

const logsDir = path.join(__dirname, '../../logs');
const combinedLog = path.join(logsDir, 'combined.log');
const errorLog = path.join(logsDir, 'error.log');

(async () => {
  await fs.ensureDir(logsDir);
  await fs.ensureFile(combinedLog);
  await fs.ensureFile(errorLog);
})();

const fileFormat = winston.format.combine(
  winston.format.uncolorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({
      filename: errorLog,
      level: 'error',
      format: fileFormat,
      options: { flags: 'a' }
    }),
    new winston.transports.File({
      filename: combinedLog,
      format: fileFormat,
      options: { flags: 'a' }
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

module.exports = logger;
