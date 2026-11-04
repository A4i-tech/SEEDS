'use strict';
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

if (connectionString) {
  const appInsights = require('applicationinsights');
  appInsights
    .setup(connectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .start();
}

const winston = require('winston');

const SENSITIVE_KEYS = /token|password|secret|authorization|apikey|connectionstring/i;

const maskSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.test(key)) info[key] = '***';
  }
  return info;
});

const otelException = winston.format((info) => {
  if (info.stack) {
    info['exception.type'] = info.name || 'Error';
    info['exception.message'] = info.message;
    info['exception.stacktrace'] = info.stack;
  }
  return info;
});

module.exports = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    maskSensitive(),
    otelException(),
    winston.format.json()
  ),
  defaultMeta: { service: 'websocket-service' },
  transports: [new winston.transports.Console({ forceConsole: true, stderrLevels: ['error'], consoleWarnLevels: ['warn'] })],
});
