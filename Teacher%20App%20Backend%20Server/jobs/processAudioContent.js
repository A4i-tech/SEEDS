/**
 * @module processAudioContent
 * @description Agenda job for processing new content: converting audio files,
 * generating TTS for titles and themes, and uploading results to Azure Blob Storage.
 */

const BlobService = require("../services/BlobService.js");
const fs = require("fs");
const { ContentV3 } = require("../models/ContentV3.js");
const { textToSpeech } = require("../services/ttsService.js");
const {
  writeBufferToFile,
  processAudioWithFfmpeg,
  cleanupTempFiles,
  generateTempPaths,
  addForInOptionAudio,
} = require("./jobsUtils.js");

// Maximum job runtime: 5 minutes.
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

// Instantiate BlobService and get container clients.
const blobService = new BlobService();
const outputContainerClient = blobService.getContainerClient("output-container");
const titleContainerClient = blobService.getContainerClient("experience-titles");
const themeContainerClient = blobService.getContainerClient("theme-titles");

/**
 * Converts an audio blob to WAV using ffmpeg, uploads it to Azure Blob Storage,
 * and returns the uploaded file URL.
 * @param {string} ip_url - The input blob URL.
 * @param {string} contentId - The content identifier.
 * @returns {Promise<string>} - URL of the processed blob.
 */
async function generateWAVFileAndUploadToOutputContainer(ip_url, contentId) {
  console.log(`Starting processing for: ${ip_url}`);
  const { tempInputPath, tempOutputPath } = generateTempPaths(contentId, ip_url);
  try {
    console.log(`Downloading blob from: ${ip_url}`);
    const inputBuffer = await blobService.downloadBlobToBuffer(ip_url);
    if (!inputBuffer || inputBuffer.length === 0) {
      throw new Error("Input buffer is empty!");
    }
    console.log(`Blob downloaded. Buffer size: ${inputBuffer.length} bytes`);

    await writeBufferToFile(inputBuffer, tempInputPath);
    console.log("Input file written.");

    console.log("Starting ffmpeg processing...");
    await processAudioWithFfmpeg(tempInputPath, tempOutputPath);
    console.log("ffmpeg processing completed.");

    const processedBuffer = fs.readFileSync(tempOutputPath);
    console.log(`Processed file size: ${processedBuffer.length} bytes`);

    const outputBlobName = `${blobService.extractBlobPathWithoutExtension(ip_url)}.wav`;
    console.log(`Uploading processed file as: ${outputBlobName}`);
    const outputBlockBlobClient = outputContainerClient.getBlockBlobClient(outputBlobName);
    await outputBlockBlobClient.uploadData(processedBuffer, {
      blobHTTPHeaders: { blobContentType: "audio/wav" },
    });
    console.log(`Processed blob uploaded: ${outputBlobName}`);
    return outputBlockBlobClient.url;
  } catch (err) {
    console.error(`Error processing ${ip_url}:`, err);
    throw err;
  } finally {
    console.log("Cleaning up temporary files...");
    cleanupTempFiles([tempInputPath, tempOutputPath]);
  }
}

/**
 * Agenda job definition for processing new content.
 */
async function processNewContent(job) {
  try {
    const { content } = job.attrs.data;
    if (!content || !content._id) {
      throw new Error("Invalid content data received.");
    }
    const contentDoc = new ContentV3(content);
    console.log("Processing audio content:", contentDoc);

    // Fail job if it runs longer than allowed.
    const timeout = setTimeout(async () => {
      console.error("Job timeout exceeded.");
      job.attrs.failedAt = new Date();
      job.attrs.errorMessage = "Job exceeded timeout of 5 minutes.";
      await job.save();
      job.fail("Job exceeded timeout of 5 minutes.");
    }, JOB_TIMEOUT_MS);

    job.attrs.data.startedAt = new Date();
    await job.save();

    // Process each audio content item.
    for (const audioContentItem of contentDoc.audioContent) {
      const ip_url = audioContentItem.audioUrl;
      audioContentItem.audioUrl = await generateWAVFileAndUploadToOutputContainer(ip_url, contentDoc.id);
    }

    if (contentDoc.isPullModel) {
      console.log("PROCESSING TITLE...");
      // Generate TTS for title.
      const titleAudioStream = await textToSpeech(
        addForInOptionAudio(contentDoc.language, contentDoc.title.local),
        contentDoc.language,
        "1.0"
      );
      const titleBlobPath = `${contentDoc.id}/1.0.mp3`;
      const titleBlobClient = titleContainerClient.getBlockBlobClient(titleBlobPath);
      await titleBlobClient.uploadStream(titleAudioStream);
      contentDoc.title.audioUrl = titleBlobClient.url;

      console.log("PROCESSING THEME...");
      // Process theme TTS audio.
      const themeBlobName = `${contentDoc.theme.english}/1.0.mp3`;
      const themeBlobClient = themeContainerClient.getBlockBlobClient(themeBlobName);
      if (await themeBlobClient.exists()) {
        contentDoc.theme.audioUrl = themeBlobClient.url;
        console.log("Theme URL exists.");
      } else {
        console.log("Creating theme audio...");
        const themeAudioStream = await textToSpeech(
          addForInOptionAudio(contentDoc.language, contentDoc.theme.local),
          contentDoc.language,
          "1.0"
        );
        await themeBlobClient.uploadStream(themeAudioStream);
        contentDoc.theme.audioUrl = themeBlobClient.url;
        console.log("Theme audio uploaded.");
      }
    }

    // Job completed successfully
    clearTimeout(timeout);
    job.attrs.completedAt = new Date();
    job.attrs.data.processedContent = contentDoc.toObject();
    await job.save();
    await contentDoc.save();
    console.log("SAVED CONTENT DOC");
    console.log(`Processed JOB: ${contentDoc}`);
  } catch (error) {
    console.error("Job failed due to error:", error);

    // Mark job as failed with error details
    job.attrs.failedAt = new Date();
    job.attrs.errorMessage = error.message || "Unknown error occurred";
    await job.save();
    job.fail(error.message || "Unknown error occurred");
  }
}

module.exports = processNewContent;
