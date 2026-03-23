/**
 * @file uploadAnnouncementsToAzure.js
 * @description Creates Azure container and uploads pause/resume announcement files
 *
 * Usage:
 *   node backend-server/src/scripts/uploadAnnouncementsToAzure.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");

// Azure Storage configuration
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

if (!accountName || !accountKey) {
  console.error("❌ Error: AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set in .env");
  process.exit(1);
}

// Container and directory configuration
const CONTAINER_NAME = "announcements";
const ANNOUNCEMENTS_DIR = path.join(__dirname, "../../../websocket-service/announcements/pause");

/**
 * Creates the announcements container if it doesn't exist
 * @param {BlobServiceClient} blobServiceClient
 * @returns {Promise<void>}
 */
async function createContainerIfNotExists(blobServiceClient) {
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  const exists = await containerClient.exists();

  if (!exists) {
    console.log(`📦 Creating container: ${CONTAINER_NAME}`);
    await containerClient.create();
    console.log(`✓ Container created: ${CONTAINER_NAME}`);
  } else {
    console.log(`✓ Container already exists: ${CONTAINER_NAME}`);
  }

  return containerClient;
}

/**
 * Uploads a single file to Azure Blob Storage
 * @param {ContainerClient} containerClient
 * @param {string} filePath
 * @param {string} blobName
 * @returns {Promise<string>} - Blob URL
 */
async function uploadFile(containerClient, filePath, blobName) {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  console.log(`  Uploading: ${blobName}`);

  await blockBlobClient.uploadFile(filePath, {
    blobHTTPHeaders: {
      blobContentType: "audio/wav"
    }
  });

  console.log(`  ✓ Uploaded: ${blockBlobClient.url}`);
  return blockBlobClient.url;
}

/**
 * Main function to upload all announcement files
 */
async function uploadAnnouncements() {
  console.log("=".repeat(80));
  console.log("Upload Announcement Files to Azure Blob Storage");
  console.log("=".repeat(80));
  console.log(`Storage Account: ${accountName}`);
  console.log(`Container: ${CONTAINER_NAME}`);
  console.log(`Source Directory: ${ANNOUNCEMENTS_DIR}\n`);

  try {
    // Create blob service client
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    );

    // Create container if needed
    const containerClient = await createContainerIfNotExists(blobServiceClient);

    // Check if announcements directory exists
    if (!fs.existsSync(ANNOUNCEMENTS_DIR)) {
      console.error(`❌ Error: Announcements directory not found: ${ANNOUNCEMENTS_DIR}`);
      console.log("\nPlease run the generation script first:");
      console.log("  npm run generate:announcements");
      process.exit(1);
    }

    // Get all WAV files
    const files = fs.readdirSync(ANNOUNCEMENTS_DIR)
      .filter(file => file.endsWith(".wav"));

    if (files.length === 0) {
      console.error("❌ Error: No WAV files found in announcements directory");
      console.log("\nPlease run the generation script first:");
      console.log("  npm run generate:announcements");
      process.exit(1);
    }

    console.log(`Found ${files.length} announcement files\n`);

    // Upload each file
    const uploadedUrls = {};
    for (const file of files) {
      const filePath = path.join(ANNOUNCEMENTS_DIR, file);
      const blobName = `pause/${file}`;

      const url = await uploadFile(containerClient, filePath, blobName);
      uploadedUrls[file] = url;
    }

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("Upload Complete");
    console.log("=".repeat(80));
    console.log(`Total files uploaded: ${Object.keys(uploadedUrls).length}\n`);

    console.log("Blob URLs:");
    console.log("-".repeat(80));
    for (const [file, url] of Object.entries(uploadedUrls)) {
      console.log(`${file}`);
      console.log(`  ${url}`);
    }
    console.log("=".repeat(80));

    // Create URL list file
    const urlListPath = path.join(ANNOUNCEMENTS_DIR, "azure_urls.json");
    fs.writeFileSync(urlListPath, JSON.stringify(uploadedUrls, null, 2));
    console.log(`\n✓ URLs saved to: ${urlListPath}`);

  } catch (error) {
    console.error("\n❌ Upload failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  uploadAnnouncements()
    .then(() => {
      console.log("\n✓ All announcements uploaded successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Upload failed:", error);
      process.exit(1);
    });
}

module.exports = { uploadAnnouncements };
