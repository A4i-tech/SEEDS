/**
 * @module processQuizContent
 * @description Agenda job for processing new quiz content: generating TTS for questions, options,
 * titles, themes, and uploading results to Azure Blob Storage.
 */

const BlobService = require("../services/BlobService.js");
const { QuizData } = require("../models/QuizData.js");
const { textToSpeech } = require("../services/ttsService.js");
const { addForInOptionAudio } = require("./jobsUtils.js");

// Maximum job runtime: 5 minutes.
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

// Instantiate BlobService and get container clients.
const blobService = new BlobService();
const outputContainerClient = blobService.getContainerClient("output-container");
const titleContainerClient = blobService.getContainerClient("experience-titles");
const themeContainerClient = blobService.getContainerClient("theme-titles");

/**
 * Agenda job definition for processing new quiz content.
 */
async function processQuizData(job) {
  try {
    const { content } = job.attrs.data;
    if (!content || !content._id) {
      throw new Error("Invalid content data received.");
    }
    // Use a document instance for transformation, but upsert on save to allow edits.
    const quizDoc = new QuizData(content);
    console.log("Processing Quiz content:", quizDoc);

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

    console.log("PROCESSING QUESTIONS...");
    var questionIndex = 1;
    for (const question of quizDoc.questions) {
      try {
        const questionAudioStream = await textToSpeech(
          question.question.text,
          quizDoc.language,
          "1.0"
        );
        const questionBlobPath = `${quizDoc.id}/question_${questionIndex}/1.0.mp3`;
        const questionBlobClient = outputContainerClient.getBlockBlobClient(questionBlobPath);
        await questionBlobClient.uploadStream(questionAudioStream);
        question.question.url = questionBlobClient.url;
        console.log(`PROCESSED QUESTION INDEX: ${questionIndex} ${question.question.url}`);

        var optionIndex = 1;
        for (const option of question.options) {
          try {
            const optionAudioStream = await textToSpeech(
              addForInOptionAudio(quizDoc.language, option.text),
              quizDoc.language,
              "1.0"
            );
            const optionBlobPath = `${quizDoc.id}/question_${questionIndex}_option_${optionIndex}/1.0.mp3`;
            const optionBlobClient = outputContainerClient.getBlockBlobClient(optionBlobPath);
            await optionBlobClient.uploadStream(optionAudioStream);
            option.url = optionBlobClient.url;
            console.log(`   PROCESSED OPTION INDEX: ${optionIndex} ${option.url}`);
          } catch (optionError) {
            console.error(
              `Error processing option ${optionIndex} for question ${questionIndex}:`,
              optionError
            );
            option.errorMessage = optionError.message || "Unknown option error";
          }
          optionIndex++;
        }
      } catch (questionError) {
        console.error(`Error processing question ${questionIndex}:`, questionError);
        question.errorMessage = questionError.message || "Unknown question error";
      }
      questionIndex++;
    }

    if (quizDoc.isPullModel) {
      try {
        console.log("PROCESSING TITLE...");
        // Generate TTS for title.
        const titleAudioStream = await textToSpeech(
          addForInOptionAudio(quizDoc.language, quizDoc.title.local),
          quizDoc.language,
          "1.0"
        );
        const titleBlobPath = `${quizDoc.id}/1.0.mp3`;
        const titleBlobClient = titleContainerClient.getBlockBlobClient(titleBlobPath);
        await titleBlobClient.uploadStream(titleAudioStream);
        quizDoc.title.audioUrl = titleBlobClient.url;

        console.log("PROCESSING THEME...");
        // Process theme TTS audio.
        const themeBlobName = `${quizDoc.theme.english}/1.0.mp3`;
        const themeBlobClient = themeContainerClient.getBlockBlobClient(themeBlobName);
        if (await themeBlobClient.exists()) {
          quizDoc.theme.audioUrl = themeBlobClient.url;
          console.log("Theme URL exists.");
        } else {
          console.log("Creating theme audio...");
          const themeAudioStream = await textToSpeech(
            addForInOptionAudio(quizDoc.language, quizDoc.theme.local),
            quizDoc.language,
            "1.0"
          );
          await themeBlobClient.uploadStream(themeAudioStream);
          quizDoc.theme.audioUrl = themeBlobClient.url;
          console.log("Theme audio uploaded.");
        }
      } catch (ttsError) {
        console.error("Error processing title or theme:", ttsError);
        quizDoc.errorMessage = ttsError.message || "Unknown TTS error";
      }
    }

    // Job completed successfully
    clearTimeout(timeout);
    job.attrs.completedAt = new Date();
    job.attrs.data.processedContent = quizDoc.toObject();
    await job.save();

    // Use atomic upsert operation to avoid race conditions
    // This handles both insert (new quiz) and update (existing quiz) cases atomically
    const processedContent = job.attrs.data.processedContent;
    await QuizData.findOneAndUpdate(
      { _id: processedContent._id },
      processedContent,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("SAVED/UPDATED QUIZ DOC (atomic upsert)");
    console.log(`Processed JOB: ${quizDoc}`);
  } catch (error) {
    console.error("Job failed due to error:", error);

    // Mark job as failed with error details
    job.attrs.failedAt = new Date();
    job.attrs.errorMessage = error.message || "Unknown error occurred";
    await job.save();
    job.fail(error.message || "Unknown error occurred");
  }
}

module.exports = processQuizData;
