import { extractDomain } from "./url";

export async function uploadToStorage(uploadUrl, file, metadata) {
  const headers = { "Content-Type": file.type };
  // Only Azure takes blob type and metadata as headers. A presigned S3 link signs its own headers.
  if (extractDomain(uploadUrl).endsWith(".blob.core.windows.net")) {
    headers["x-ms-blob-type"] = "BlockBlob";
    Object.entries(metadata).forEach(([name, value]) => {
      headers[`x-ms-meta-${name}`] = value;
    });
  }
  const response = await fetch(uploadUrl, { method: "PUT", headers, body: file });
  if (!response.ok) {
    throw new Error(
      `Audio upload failed with status ${response.status}. Try saving again. If the error repeats, ask an administrator to check the storage settings.`
    );
  }
}
