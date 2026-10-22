// src/services/blobStorage.js

let provider = null;

function loadProvider() {
  const backend = process.env.STORAGE_BACKEND;
  // Required on first use so a provider's SDK is only needed when that provider is selected.
  if (backend === "object-store") return require("./objectStoreBlobService");
  if (backend === "azure") return require("./azureBlobService");
  throw new Error(
    `STORAGE_BACKEND=${backend} is not supported. Set STORAGE_BACKEND to object-store or azure.`
  );
}

async function getBlobData(containerName, blobName) {
  provider = provider || loadProvider();
  return provider.getBlobData(containerName, blobName);
}

module.exports = { getBlobData };
