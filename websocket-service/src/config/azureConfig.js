// src/config/azureConfig.js

require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { StorageSharedKeyCredential } = require('@azure/storage-blob');
// Use DefaultAzureCredential for authentication

// Replace with your Azure Storage account name
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
let useAccountKey = false;
let blobServiceClient = null;

if (!accountName) {
  throw new Error('Azure Storage account name not specified in environment variables.');
}
if (accountName && accountKey){
  useAccountKey = true;
  console.log('Using Azure Storage account key for authentication.');
}

if(useAccountKey){
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
}
else{
  const credential = new DefaultAzureCredential();
  blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
}

module.exports = { blobServiceClient };
