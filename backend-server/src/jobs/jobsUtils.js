/**
 * @module jobsUtils
 * @description Utility functions for file I/O, audio processing using ffmpeg,
 * temporary file management, and language-specific text adjustments.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

/**
 * Writes a Buffer to a file.
 * @param {Buffer} buffer - Data to write.
 * @param {string} filePath - Destination file path.
 * @returns {Promise<void>}
 */
function writeBufferToFile(buffer, filePath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    writeStream.write(buffer);
    writeStream.end();
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

/**
 * Processes an audio file with ffmpeg.
 * @param {string} inputPath - Path to the input file.
 * @param {string} outputPath - Desired output file path.
 * @param {Array<string>} outputOptions - ffmpeg output options.
 * @returns {Promise<void>}
 */
function processAudioWithFfmpeg(
  inputPath,
  outputPath,
  outputOptions = ["-ar 8000", "-ac 1", "-sample_fmt s16"]
) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setFfmpegPath(ffmpegPath)
      .outputOptions(outputOptions)
      .output(outputPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

/**
 * Deletes temporary files.
 * @param {string[]} filePaths - Array of file paths to delete.
 */
function cleanupTempFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error("Error cleaning up file:", filePath, err);
    }
  }
}

/**
 * Generates temporary input and output file paths.
 * @param {string} contentId - The content ID.
 * @param {string} ip_url - The original blob URL.
 * @returns {{ tempInputPath: string, tempOutputPath: string }}
 */
function generateTempPaths(contentId, ip_url) {
  const baseDir = os.tmpdir();
  const tempInputPath = path.join(baseDir, `${contentId}_audioContent_${path.basename(ip_url)}`);
  const tempOutputPath = path.join(
    baseDir,
    `output_${contentId}_audioContent_${path.basename(ip_url).replace(/\.(mp3|wav)$/, ".wav")}`
  );
  return { tempInputPath, tempOutputPath };
}

const FFPROBE_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

/**
 * Extracts the duration of an audio file using ffprobe.
 * Uses a `cancelled` flag so that if the timeout fires first, the ffprobe
 * callback becomes a no-op (prevents zombie callbacks from resolving/rejecting
 * an already-settled promise race).
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<number|null>} - Duration in seconds, or null on failure.
 */
function extractAudioDuration(filePath) {
  let cancelled = false;
  const ffprobePromise = new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (cancelled) return;
      if (err) {
        reject(err);
      } else {
        const parsed = parseFloat(metadata?.format?.duration);
        resolve(Number.isFinite(parsed) ? parsed : null);
      }
    });
  });

  return withTimeout(ffprobePromise, FFPROBE_TIMEOUT_MS, "ffprobe").catch((err) => {
    cancelled = true;
    throw err;
  });
}

/**
 * Extracts the duration of an audio file using ffprobe.
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<number|null>} - Duration in seconds, or null on failure.
 */
function extractAudioDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error("Error extracting audio duration:", err);
        resolve(null);
      } else {
        const duration = metadata?.format?.duration;
        resolve(duration ? parseFloat(duration) : null);
      }
    });
  });
}

/**
 * Adjusts an option string based on language.
 * For example, for Kannada, "option" becomes "optionಗಾಗಿ".
 * @param {string} lang - The language (e.g., "kannada", "english").
 * @param {string} option - The original text.
 * @returns {string} - The adjusted text.
 */
function addForInOptionAudio(lang, option) {
  let res = option.trim();
  switch (lang.toLowerCase()) {
    case "kannada":
      res += "ಗಾಗಿ";
      break;
    case "english":
      res = "for " + res;
      break;
    case "marathi":
      res += "साठी";
      break;
    case "hindi":
      res += " के लिए";
      break;
    case "bengali":
      res += " জন্য";
      break;
    default:
      break;
  }
  return res;
}

module.exports = {
  writeBufferToFile,
  processAudioWithFfmpeg,
  cleanupTempFiles,
  generateTempPaths,
  extractAudioDuration,
  addForInOptionAudio,
  withTimeout,
};
