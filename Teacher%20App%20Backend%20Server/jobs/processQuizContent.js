/**
 * @module processQuizContent
 * @description Agenda job for processing new content: converting audio files,
 * generating TTS for titles and themes, and uploading results to Azure Blob Storage.
 */

const BlobService = require("../models/BlobService.js");
const fs = require("fs");
const { QuizData } = require("../models/QuizData.js");
const { textToSpeech } = require("../models/ttsService.js");
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
 * Agenda job definition for processing new quiz.
 */
async function processQuizData(job) {
  const { content } = job.attrs.data;
  if (!content || !content._id) {
    console.error("Invalid content data received.");
    return;
  }
  const quizDoc = new QuizData(content);
  console.log("Processing Quiz content:", quizDoc);

  // Fail job if it runs longer than allowed.
  const timeout = setTimeout(async () => {
    console.error("Job timeout exceeded.");
    job.attrs.failedAt = new Date();
    job.attrs.data.errorMessage = "Job exceeded timeout of 5 minutes.";
    await job.save();
    job.fail("Job exceeded timeout of 5 minutes.");
  }, JOB_TIMEOUT_MS);

  job.attrs.data.startedAt = new Date();
  await job.save();

  console.log("PROCESSING QUESTIONS...");
  var questionIndex = 1;
  for (const question of quizDoc.questions){
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
    
    var optionIndex = 1
    for (const option of question.options){
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
        optionIndex++;
    }
    questionIndex++;
  }

  if (quizDoc.isPullModel) {
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
  }

  job.attrs.data.completedAt = new Date();
  job.attrs.data.processedContent = quizDoc.toObject();
  await job.save();
  await quizDoc.save()
  console.log('SAVED QUIZ DOC')
  console.log(`Processed JOB: ${quizDoc}`);
}

module.exports = processQuizData
