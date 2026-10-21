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

module.exports = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'websocket-service' },
  transports: [new winston.transports.Console({ forceConsole: true, stderrLevels: ['error'], consoleWarnLevels: ['warn'] })],
});
