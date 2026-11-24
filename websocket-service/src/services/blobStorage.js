// src/services/blobStorage.js

const BACKENDS = {
  "object-store": () => require("./objectStoreBlobService"),
  azure: () => require("./azureBlobService"),
};

const backend = process.env.STORAGE_BACKEND;
if (!Object.hasOwn(BACKENDS, backend)) {
  throw new Error(
    `STORAGE_BACKEND is ${backend ? `"${backend}"` : "unset"}. Set STORAGE_BACKEND to object-store or azure.`
  );
}

let provider = null;

async function getBlobData(containerName, blobName) {
  // Required on first use so a provider's SDK is only needed when that provider is selected.
  provider = provider || BACKENDS[backend]();
  return provider.getBlobData(containerName, blobName);
}

module.exports = { getBlobData };
