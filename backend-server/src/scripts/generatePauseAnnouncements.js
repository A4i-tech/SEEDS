/**
 * @file generatePauseAnnouncements.js
 * @description Generates pause/resume announcement audio files for IVRv2
 *
 * Creates 12 announcement files:
 * - 6 "Paused. Press 0 to resume" (one per language)
 * - 6 "Resuming" (one per language)
 *
 * Output format: 16-bit PCM WAV, 8kHz, mono (for Vonage compatibility)
 *
 * Usage:
 *   node backend-server/src/scripts/generatePauseAnnouncements.js
 */

const path = require("path");
const fs = require("fs");

// Load environment variables
require("dotenv").config();

// Import modules
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

// Import TTS service
const { textToSpeech } = require("../services/ttsService");

// Output directory
const OUTPUT_DIR = path.join(__dirname, "../../../websocket-service/announcements/pause");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Announcement texts for all languages
const ANNOUNCEMENTS = {
  paused: {
    kannada: "ವಿರಾಮಗೊಳಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು 0 ಒತ್ತಿರಿ",
    english: "Paused. Press 0 to resume",
    hindi: "रोका गया। जारी रखने के लिए 0 दबाएं",
    bengali: "বিরতি দেওয়া হয়েছে। পুনরায় শুরু করতে 0 চাপুন",
    tamil: "இடைநிறுத்தப்பட்டது. மீண்டும் தொடங்க 0 அழுத்தவும்",
    marathi: "विराम दिला. पुन्हा सुरू करण्यासाठी 0 दाबा"
  },
  resuming: {
    kannada: "ಮುಂದುವರಿಸಲಾಗುತ್ತಿದೆ",
    english: "Resuming",
    hindi: "जारी रखा जा रहा है",
    bengali: "পুনরায় শুরু করা হচ্ছে",
    tamil: "மீண்டும் தொடங்குகிறது",
    marathi: "पुन्हा सुरू करत आहे"
  }
};

// Language code mapping
const LANGUAGE_CODES = {
  kannada: "kn",
  english: "en",
  hindi: "hi",
  bengali: "bn",
  tamil: "ta",
  marathi: "mr"
};

/**
 * Converts MP3 to WAV with correct format for Vonage
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path to output WAV file
 * @returns {Promise<void>}
 */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setFfmpegPath(ffmpegPath)
      .outputOptions([
        "-ar 8000",        // 8kHz sample rate (Vonage requirement)
        "-ac 1",           // Mono channel
        "-sample_fmt s16", // 16-bit signed integer
        "-f wav"           // WAV format
      ])
      .output(outputPath)
      .on("end", () => {
        console.log(`  ✓ Converted to WAV: ${path.basename(outputPath)}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`  ✗ Conversion failed: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Generates a single announcement file
 * @param {string} state - "paused" or "resuming"
 * @param {string} language - Language name (e.g., "kannada", "english")
 * @param {string} text - Text to convert to speech
 * @returns {Promise<void>}
 */
async function generateAnnouncement(state, language, text) {
  const langCode = LANGUAGE_CODES[language];
  const tempMp3Path = path.join(OUTPUT_DIR, `${state}_${langCode}_temp.mp3`);
  const outputWavPath = path.join(OUTPUT_DIR, `${state}_${langCode}.wav`);

  try {
    console.log(`\nGenerating: ${state}_${langCode}.wav`);
    console.log(`  Text: "${text}"`);
    console.log(`  Language: ${language}`);

    // Generate MP3 using Azure TTS (without filename to get stream)
    const audioStream = await textToSpeech(text, language, "1.0");

    // Write stream to temp file
    const writeStream = fs.createWriteStream(tempMp3Path);
    audioStream.pipe(writeStream);

    // Wait for file to be written
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Verify file exists and has content
    if (!fs.existsSync(tempMp3Path) || fs.statSync(tempMp3Path).size === 0) {
      throw new Error("Temp MP3 file not created or is empty");
    }

    console.log(`  ✓ TTS generated: ${fs.statSync(tempMp3Path).size} bytes`);

    // Convert MP3 to WAV with correct format
    await convertToWav(tempMp3Path, outputWavPath);

    // Clean up temp file
    if (fs.existsSync(tempMp3Path)) {
      fs.unlinkSync(tempMp3Path);
    }

    console.log(`  ✓ Complete: ${state}_${langCode}.wav`);

  } catch (error) {
    console.error(`  ✗ Failed to generate ${state}_${langCode}.wav:`, error.message);
    throw error;
  }
}

/**
 * Main function to generate all announcement files
 */
async function generateAllAnnouncements() {
  console.log("=".repeat(80));
  console.log("Generating Pause/Resume Announcement Audio Files");
  console.log("=".repeat(80));
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  // Generate all announcements
  for (const state of ["paused", "resuming"]) {
    for (const language of Object.keys(LANGUAGE_CODES)) {
      const text = ANNOUNCEMENTS[state][language];

      try {
        await generateAnnouncement(state, language, text);
        successCount++;
      } catch (error) {
        console.error(`Failed to generate ${state}_${LANGUAGE_CODES[language]}.wav`);
        failCount++;
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(80));
  console.log("Generation Complete");
  console.log("=".repeat(80));
  console.log(`Total files:     ${successCount + failCount}`);
  console.log(`Successful:      ${successCount}`);
  console.log(`Failed:          ${failCount}`);
  console.log(`Duration:        ${duration}s`);
  console.log("=".repeat(80));

  if (failCount > 0) {
    console.warn("\n⚠ Some files failed to generate. Check errors above.");
    process.exit(1);
  } else {
    console.log("\n✓ All announcement files generated successfully!");
  }
}

// Run if executed directly
if (require.main === module) {
  generateAllAnnouncements()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n✗ Generation failed:", error);
      process.exit(1);
    });
}

module.exports = { generateAllAnnouncements };
