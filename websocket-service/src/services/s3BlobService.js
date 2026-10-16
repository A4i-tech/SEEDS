// src/services/s3BlobService.js

const Minio = require("minio");

let client = null;

function parseEndpoint(value) {
  let url = null;
  try {
    url = new URL(value);
  } catch {
    // Reported below with the other bad-value case.
  }
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      `S3_ENDPOINT_URL "${value}" must be a full URL that starts with http:// or https://. Set it to a value such as http://localhost:9000.`
    );
  }
  return { endPoint: url.hostname, port: Number(url.port), useSSL: url.protocol === "https:" };
}

function getClient() {
  if (client) return client;

  const { S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  const missing = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `STORAGE_BACKEND=s3 needs ${missing.join(" and ")}. Set ${missing.join(" and ")} or use STORAGE_BACKEND=azure.`
    );
  }

  const endpoint = S3_ENDPOINT_URL
    ? parseEndpoint(S3_ENDPOINT_URL)
    : { endPoint: "s3.amazonaws.com", useSSL: true };

  client = new Minio.Client({
    ...endpoint,
    accessKey: S3_ACCESS_KEY_ID,
    secretKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION || "us-east-1",
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
