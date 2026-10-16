// src/services/blobStorage.js

let provider = null;

function loadProvider() {
  const backend = process.env.STORAGE_BACKEND || "s3";
  // Required on first use so a provider's SDK is only needed when that provider is selected.
  if (backend === "s3") return require("./s3BlobService");
  if (backend === "azure") return require("./azureBlobService");
  throw new Error(
    `STORAGE_BACKEND=${backend} is not supported. Set STORAGE_BACKEND to s3 or azure.`
  );
}

async function getBlobData(containerName, blobName) {
  provider = provider || loadProvider();
  return provider.getBlobData(containerName, blobName);
}

module.exports = { getBlobData };
