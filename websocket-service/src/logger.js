'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const winston = require('winston');

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

let client = null;

if (connectionString) {
  const appInsights = require('applicationinsights');
  appInsights
    .setup(connectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectConsole(false)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .start();

  client = appInsights.defaultClient;
}

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SEVERITY = { debug: 0, info: 1, warn: 2, error: 3 };
const CONSOLE_METHOD = { error: 'error', warn: 'warn', info: 'log', debug: 'log' };
const RESERVED_KEYS = new Set(['timestamp', 'level', 'service', 'message', 'error', 'exception']);

const SENSITIVE_KEYS = /token|password|secret|authorization|apikey|connectionstring/i;

const maskSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.test(key)) info[key] = '***';
  }
  return info;
});

class ConsoleAppInsightsTransport extends winston.Transport {
  log(info, callback) {
    const { exception, ...entry } = info;
    console[CONSOLE_METHOD[info.level]](JSON.stringify(entry));

    if (client) {
      const properties = {};
      for (const key of Object.keys(info)) {
        if (!RESERVED_KEYS.has(key)) properties[key] = info[key];
      }
      if (exception instanceof Error) {
        client.trackException({ exception, properties: { ...properties, message: info.message } });
      } else {
        client.trackTrace({ message: info.message, severity: SEVERITY[info.level], properties });
      }
    }
    callback();
  }
}

const winstonLogger = winston.createLogger({
  levels: LEVELS,
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'websocket-service' },
  format: winston.format.combine(winston.format.timestamp(), maskSensitive()),
  transports: [new ConsoleAppInsightsTransport()],
});

const logger = {
  debug: (message, properties) => winstonLogger.debug(message, properties),
  info: (message, properties) => winstonLogger.info(message, properties),
  warn: (message, properties) => winstonLogger.warn(message, properties),
  error: (message, error, properties) =>
    winstonLogger.error(message, {
      ...properties,
      error: error instanceof Error ? error.message : error,
      exception: error,
    }),
};

logger.withContext = (context) => ({
  debug: (message, properties) => logger.debug(message, { ...context, ...properties }),
  info: (message, properties) => logger.info(message, { ...context, ...properties }),
  warn: (message, properties) => logger.warn(message, { ...context, ...properties }),
  error: (message, error, properties) => logger.error(message, error, { ...context, ...properties }),
});

logger.generateCorrelationId = () => crypto.randomUUID();

module.exports = logger;