// src/config/azureConfig.js

require("dotenv").config();
const logger = require("../logger");

let blobServiceClient = null;

// Required here so the Azure SDK is only needed when STORAGE_BACKEND=azure.
function requireAzureSdk() {
  try {
    return { ...require("@azure/identity"), ...require("@azure/storage-blob") };
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error(
      "STORAGE_BACKEND=azure needs @azure/identity and @azure/storage-blob. Install them with npm install (without --omit=optional) or use STORAGE_BACKEND=s3."
    );
  }
}

function getBlobServiceClient() {
  if (blobServiceClient) return blobServiceClient;

  const { DefaultAzureCredential, BlobServiceClient, StorageSharedKeyCredential } =
    requireAzureSdk();

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

  if (!accountName) {
    throw new Error(
      "STORAGE_BACKEND=azure needs AZURE_STORAGE_ACCOUNT_NAME. Set AZURE_STORAGE_ACCOUNT_NAME or use STORAGE_BACKEND=s3."
    );
  }

  let credential;
  if (accountKey) {
    logger.info("Using Azure Storage account key for authentication.");
    credential = new StorageSharedKeyCredential(accountName, accountKey);
  } else {
    credential = new DefaultAzureCredential();
  }

  blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
  return blobServiceClient;
}

module.exports = { getBlobServiceClient };
