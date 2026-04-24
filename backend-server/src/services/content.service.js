"use strict";

const PATCHABLE_CONTENT_FIELDS = [
  "description",
  "type",
  "language",
  "title",
  "theme",
  "audioContent",
  "isPullModel",
  "isTeacherApp",
  "localTitle",
  "localTheme",
  "positiveMark",
  "positiveMarks",
  "negativeMark",
  "negativeMarks",
  "questions",
  "options",
  "correctAnswers",
];

function sanitizePatchableContentFields(body = {}) {
  const updatePayload = {};

  PATCHABLE_CONTENT_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      updatePayload[key] = body[key];
    }
  });

  return updatePayload;
}

function readEnglishTextField(rawValue, fieldName) {
  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (rawValue && typeof rawValue.english === "string") {
    return rawValue.english;
  }

  throw new Error(`${fieldName} must be a string or an object with english string`);
}

function buildQuizUpdatePayload(existingQuiz, updatePayload) {
  const quizUpdate = {};

  if (updatePayload.language !== undefined) quizUpdate.language = updatePayload.language;
  if (updatePayload.isPullModel !== undefined) quizUpdate.isPullModel = updatePayload.isPullModel;
  if (updatePayload.isTeacherApp !== undefined) quizUpdate.isTeacherApp = updatePayload.isTeacherApp;

  const posMarks = updatePayload.positiveMarks ?? updatePayload.positiveMark;
  const negMarks = updatePayload.negativeMarks ?? updatePayload.negativeMark;
  if (posMarks !== undefined) quizUpdate.positiveMarks = posMarks;
  if (negMarks !== undefined) quizUpdate.negativeMarks = negMarks;

  if (updatePayload.title !== undefined) {
    const englishTitle = readEnglishTextField(updatePayload.title, "title");
    const localTitle =
      typeof updatePayload.localTitle === "string"
        ? updatePayload.localTitle
        : existingQuiz.title?.local;

    quizUpdate.title = {
      english: englishTitle,
      local: localTitle,
      audioUrl: existingQuiz.title?.audioUrl,
    };
  }

  if (updatePayload.theme !== undefined) {
    const englishTheme = readEnglishTextField(updatePayload.theme, "theme");
    const localTheme =
      typeof updatePayload.localTheme === "string"
        ? updatePayload.localTheme
        : existingQuiz.theme?.local;

    quizUpdate.theme = {
      english: englishTheme,
      local: localTheme,
      audioUrl: existingQuiz.theme?.audioUrl,
    };
  }

  const questionTexts = updatePayload.questions;
  const optionArrays = updatePayload.options;
  const correctAnswers = updatePayload.correctAnswers;

  if (Array.isArray(questionTexts) && Array.isArray(optionArrays)) {
    quizUpdate.questions = questionTexts.map((questionText, qIdx) => {
      const existing = existingQuiz.questions?.[qIdx];
      const optTexts = optionArrays[qIdx];
      const correctIdx = Array.isArray(correctAnswers) ? (correctAnswers[qIdx] ?? 0) : 0;

      return {
        question: {
          id: existing?.question?.id,
          url: existing?.question?.url,
          text: questionText,
        },
        options: (optTexts ?? []).map((optText, oIdx) => ({
          id: existing?.options?.[oIdx]?.id,
          url: existing?.options?.[oIdx]?.url,
          text: optText,
        })),
        correct_option_id: existing?.options?.[correctIdx]?.id,
      };
    });
  }

  return quizUpdate;
}

function buildStoryUpdatePayload(updatePayload, { isAudioUploaded = false } = {}) {
  const storyUpdate = { ...updatePayload };

  if (isAudioUploaded) {
    storyUpdate.isProcessed = false;
  }

  return storyUpdate;
}

module.exports = {
  PATCHABLE_CONTENT_FIELDS,
  sanitizePatchableContentFields,
  buildQuizUpdatePayload,
  buildStoryUpdatePayload,
};
