'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

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

  appInsights.defaultClient.context.tags[
    appInsights.defaultClient.context.keys.cloudRole
  ] = 'websocket-service';

  client = appInsights.defaultClient;
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const SENSITIVE_KEYS = /token|password|secret|authorization|apikey|connectionstring/i;

function maskProperties(properties) {
  const masked = {};
  for (const [key, value] of Object.entries(properties)) {
    masked[key] = SENSITIVE_KEYS.test(key) ? '***' : value;
  }
  return masked;
}

function write(level, message, properties) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'websocket-service',
    message,
    ...properties,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function log(level, message, properties = {}) {
  if (LEVELS[level] < configuredLevel) return;
  const masked = maskProperties(properties);
  write(level, message, masked);
  if (client) client.trackTrace({ message, severity: LEVELS[level], properties: masked });
}

const logger = {
  debug(message, properties = {}) {
    log('debug', message, properties);
  },

  info(message, properties = {}) {
    log('info', message, properties);
  },

  warn(message, properties = {}) {
    log('warn', message, properties);
  },

  error(message, error, properties = {}) {
    if (LEVELS.error < configuredLevel) return;
    const masked = maskProperties(properties);
    write('error', message, { ...masked, error: error instanceof Error ? error.message : error ?? null });
    if (client) {
      if (error instanceof Error) {
        client.trackException({ exception: error, properties: { ...masked, message } });
      } else {
        client.trackTrace({ message, severity: LEVELS.error, properties: masked });
      }
    }
  },
};

logger.withContext = function withContext(context) {
  return {
    debug(message, properties = {}) {
      logger.debug(message, { ...context, ...properties });
    },
    info(message, properties = {}) {
      logger.info(message, { ...context, ...properties });
    },
    warn(message, properties = {}) {
      logger.warn(message, { ...context, ...properties });
    },
    error(message, error, properties = {}) {
      logger.error(message, error, { ...context, ...properties });
    },
  };
};

logger.generateCorrelationId = function generateCorrelationId() {
  return crypto.randomUUID();
};

module.exports = logger;
