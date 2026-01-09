// src/services/azureBlobService.js

const { blobServiceClient } = require("../config/azureConfig");

/**
 * Retrieves the entire blob data as a Buffer.
 * @param {string} containerName - Name of the container.
 * @param {string} blobName - Name of the blob.
 * @returns {Buffer} - Buffer containing the blob data.
 */
async function getBlobData(containerName, blobName) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  // Download the blob content
  const downloadBlockBlobResponse = await blobClient.download();
  const chunks = [];
  const readableStream = downloadBlockBlobResponse.readableStreamBody;

  // Read all data chunks into an array
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }

  // Concatenate all chunks into a single Buffer
  const blobData = Buffer.concat(chunks);
  return blobData;
}

module.exports = { getBlobData };
