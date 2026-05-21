'use strict';
const path = require('path');
const fs = require('fs');
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

const logger = {
  info(message, properties = {}) {
    console.log(message, Object.keys(properties).length ? properties : '');
    if (client) client.trackTrace({ message, severity: 1, properties });
  },

  warn(message, properties = {}) {
    console.warn(message, Object.keys(properties).length ? properties : '');
    if (client) client.trackTrace({ message, severity: 2, properties });
  },

  error(message, error, properties = {}) {
    console.error(message, error ?? '', Object.keys(properties).length ? properties : '');
    if (client) {
      if (error instanceof Error) {
        client.trackException({ exception: error, properties: { ...properties, message } });
      } else {
        client.trackTrace({ message, severity: 3, properties });
      }
    }
  },
};

module.exports = logger;
