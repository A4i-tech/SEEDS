// src/services/objectStoreBlobService.js

const Minio = require("minio");

let client = null;

function getClient() {
  if (client) return client;

  const { OBJECT_STORE_ENDPOINT_URL, OBJECT_STORE_ACCESS_KEY_ID, OBJECT_STORE_SECRET_ACCESS_KEY, OBJECT_STORE_REGION } = process.env;
  if (!OBJECT_STORE_ENDPOINT_URL) {
    throw new Error(
      "OBJECT_STORE_ENDPOINT_URL is not set. Set it to the URL of your S3-compatible server, for example http://localhost:9000."
    );
  }
  const url = new URL(OBJECT_STORE_ENDPOINT_URL);

  client = new Minio.Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    useSSL: url.protocol === "https:",
    accessKey: OBJECT_STORE_ACCESS_KEY_ID,
    secretKey: OBJECT_STORE_SECRET_ACCESS_KEY,
    region: OBJECT_STORE_REGION,
    pathStyle: true,
  });
  return client;
}

async function getBlobData(containerName, blobName) {
  const stream = await getClient().getObject(containerName, blobName);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { getBlobData };
