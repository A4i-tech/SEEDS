"use strict";
import path from "path";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

let containerClient: ContainerClient | undefined;

function getContainer(): ContainerClient {
  if (containerClient) return containerClient;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  const svc = BlobServiceClient.fromConnectionString(connectionString, {
    keepAliveOptions: { enable: true },
    retryOptions: { maxTries: 4 },
  });
  containerClient = svc.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || "subodha");
  return containerClient;
}

/**
 * Uploads a buffer to the configured container at blobPath, skipping the upload
 * if a blob already exists there (idempotent re-runs). Returns the blob's URL.
 */
export async function uploadAsset(blobPath: string, buffer: Buffer, fileName: string): Promise<string> {
  const blockBlobClient = getContainer().getBlockBlobClient(blobPath);

  const exists = await blockBlobClient.exists();
  if (exists) {
    return blockBlobClient.url;
  }

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentTypeFor(fileName) },
  });
  return blockBlobClient.url;
}
