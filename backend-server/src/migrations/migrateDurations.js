/**
 * @module migrateDurations
 * @description Migration script to extract and populate audio duration for existing content.
 * This script downloads existing audio files, extracts their duration using ffprobe,
 * and updates the MongoDB database with the duration values.
 *
 * Usage:
 *   node backend-server/src/migrations/migrateDurations.js
 *
 * Environment Variables:
 *   DB_CONNECTION - MongoDB connection string (optional, uses default from config)
 */

const mongoose = require("mongoose");
const config = require("../config/env.js");
const { ContentV3 } = require("../models/ContentV3.js");
const BlobService = require("../services/BlobService.js");
const {
  extractAudioDuration,
  writeBufferToFile,
  cleanupTempFiles,
  generateTempPaths,
} = require("../jobs/jobsUtils.js");

// MongoDB connection URI (use environment variable or default)
const MONGO_URI = config.dbConnection;

// Statistics tracking
const stats = {
  total: 0,
  processed: 0,
  skipped: 0,
  failed: 0,
  updated: 0,
};

/**
 * Extracts duration for a single audio content item.
 * @param {object} audioContentItem - The audio content item.
 * @param {string} contentId - The content ID.
 * @param {BlobService} blobService - The blob service instance.
 * @returns {Promise<number|null>} - Duration in seconds, or null on failure.
 */
async function extractDurationForAudioItem(audioContentItem, contentId, blobService) {
  const audioUrl = audioContentItem.audioUrl;
  if (!audioUrl) {
    console.warn(`  ⚠ No audio URL found, skipping`);
    return null;
  }

  const { tempInputPath } = generateTempPaths(contentId, audioUrl);

  try {
    console.log(`  Downloading: ${audioUrl}`);
    const audioBuffer = await blobService.downloadBlobToBuffer(audioUrl);

    if (!audioBuffer || audioBuffer.length === 0) {
      console.error(`  ✗ Failed to download audio file`);
      return null;
    }

    await writeBufferToFile(audioBuffer, tempInputPath);
    console.log(`  Extracting duration...`);

    const duration = await extractAudioDuration(tempInputPath);

    if (duration !== null) {
      console.log(`  ✓ Duration: ${duration} seconds`);
    } else {
      console.error(`  ✗ Failed to extract duration`);
    }

    return duration;
  } catch (error) {
    console.error(`  ✗ Error processing audio: ${error.message}`);
    return null;
  } finally {
    cleanupTempFiles([tempInputPath]);
  }
}

/**
 * Main migration function.
 */
async function migrateDurations() {
  console.log("=".repeat(80));
  console.log("Starting Duration Migration");
  console.log("=".repeat(80));
  console.log(`MongoDB URI: ${MONGO_URI}\n`);

  if (!MONGO_URI) {
    throw new Error(
      "DB_CONNECTION is not set. Add it to your environment or backend-server/.env file."
    );
  }

  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Initialize blob service
    const blobService = new BlobService();

    // Fetch all content documents with audio content
    console.log("Fetching content documents with audio...");
    const contentDocs = await ContentV3.find({
      audioContent: { $exists: true, $ne: [] },
    }).exec();

    console.log(`Found ${contentDocs.length} content documents with audio\n`);

    // Process each content document
    for (const contentDoc of contentDocs) {
      console.log(`\nProcessing Content ID: ${contentDoc._id}`);
      console.log(`  Language: ${contentDoc.language}`);
      console.log(`  Audio items: ${contentDoc.audioContent.length}`);

      let documentUpdated = false;

      for (let i = 0; i < contentDoc.audioContent.length; i++) {
        const audioContentItem = contentDoc.audioContent[i];
        stats.total++;

        console.log(`\n  Audio Item ${i + 1}/${contentDoc.audioContent.length}:`);

        // Skip if duration already exists (idempotent)
        if (
          audioContentItem.durationSeconds !== null &&
          audioContentItem.durationSeconds !== undefined
        ) {
          console.log(
            `  ⊘ Duration already exists (${audioContentItem.durationSeconds}s), skipping`
          );
          stats.skipped++;
          continue;
        }

        // Extract duration
        const duration = await extractDurationForAudioItem(
          audioContentItem,
          contentDoc._id,
          blobService
        );

        if (duration !== null) {
          audioContentItem.durationSeconds = duration;
          documentUpdated = true;
          stats.processed++;
        } else {
          stats.failed++;
        }
      }

      // Save document if any audio items were updated
      if (documentUpdated) {
        try {
          await contentDoc.save();
          console.log(`\n  ✓ Saved content document ${contentDoc._id}`);
          stats.updated++;
        } catch (error) {
          console.error(`\n  ✗ Failed to save content document: ${error.message}`);
        }
      }
    }

    // Print final statistics
    console.log("\n" + "=".repeat(80));
    console.log("Migration Complete");
    console.log("=".repeat(80));
    console.log(`Total audio items:       ${stats.total}`);
    console.log(`Successfully processed:  ${stats.processed}`);
    console.log(`Skipped (already exist): ${stats.skipped}`);
    console.log(`Failed:                  ${stats.failed}`);
    console.log(`Documents updated:       ${stats.updated}`);
    console.log("=".repeat(80));

    // Calculate success rate
    const successRate =
      stats.total > 0 ? ((stats.processed / (stats.total - stats.skipped)) * 100).toFixed(2) : 0;
    console.log(`Success rate: ${successRate}%`);

    if (stats.failed > 0) {
      console.warn(`\n⚠ Warning: ${stats.failed} items failed to process`);
    }
  } catch (error) {
    console.error("\n✗ Migration failed with error:", error);
    process.exit(1);
  } finally {
    // Disconnect from MongoDB
    console.log("\nDisconnecting from MongoDB...");
    await mongoose.disconnect();
    console.log("✓ Disconnected\n");
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateDurations()
    .then(() => {
      console.log("Migration script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = migrateDurations;
