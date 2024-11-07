// src/config/azureConfig.js

require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');

// Use DefaultAzureCredential for authentication
const credential = new DefaultAzureCredential();

// Replace with your Azure Storage account name
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

if (!accountName) {
  throw new Error('Azure Storage account name not specified in environment variables.');
}

// Create BlobServiceClient
const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  credential
);

module.exports = { blobServiceClient };
