"use strict";
const mongoose = require("mongoose");
const { TextContentSchema } = require("./ContentV3");
const { Schema } = mongoose;

// Option schema for nested option objects
const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: false, default: "<NOT CREATED>" },
    text: { type: String, required: true },
  },
  {
    _id: false, // Prevent Mongoose from creating an automatic _id for options
  }
);

// Question schema for nested question objects
const questionSchema = new Schema(
  {
    question: {
      id: { type: String, required: true },
      url: { type: String, required: false, default: "<NOT CREATED>" },
      text: { type: String, required: true },
    },
    options: [optionSchema],
    correct_option_id: { type: String, required: true },
  },
  {
    _id: false, // Prevent Mongoose from creating an automatic _id for questions
  }
);

// Main quiz schema
const quizSchema = new Schema(
  {
    _id: { type: String, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Tenant" },
    schoolId: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
    createdBy: { type: String, default: "" },
    creation_time: { type: Number, default: -1 },
    isPullModel: { type: Boolean, default: false },
    isTeacherApp: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    language: { type: String, required: true },
    title: { type: TextContentSchema, required: true },
    theme: { type: TextContentSchema, required: true },
    positiveMarks: { type: Number, required: true },
    negativeMarks: { type: Number, required: true },
    questions: [questionSchema],
  },
  {
    collection: "quizData",
  }
);

const QuizData = mongoose.model("QuizData", quizSchema);

const getAllQuizData = () => {
  return QuizData.find().sort({ creation_time: -1 }).exec();
};

const getQuizById = (id) => {
  return QuizData.findOne({ id }).exec();
};

const fromQuizCreateRequest = (quizRequest) => {
  // Create a new QuizData object
  const quizData = new QuizData({
    _id: quizRequest.id,
    language: quizRequest.language,
    isPullModel: quizRequest.isPullModel,
    isTeacherApp: quizRequest.isTeacherApp,
    theme: {
      english: quizRequest.theme,
      local: quizRequest.localTheme,
      audioUrl: quizRequest.themeAudio,
    },
    title: {
      english: quizRequest.title,
      local: quizRequest.localTitle,
      audioUrl: quizRequest.titleAudio,
    },
    positiveMarks: quizRequest.positiveMark,
    negativeMarks: quizRequest.negativeMark,
    questions: quizRequest.questions.map((questionText, index) => ({
      question: {
        id: `${quizRequest.id}-q${index + 1}`,
        url:
          quizRequest.quizAudioData && quizRequest.quizAudioData.questionAudios
            ? quizRequest.quizAudioData.questionAudios[index]
            : "<NOT CREATED>",
        text: questionText,
      },
      options: quizRequest.options[index].map((optionText, optionIndex) => ({
        id: `${quizRequest.id}-q${index + 1}-opt${optionIndex + 1}`,
        url:
          quizRequest.quizAudioData &&
          quizRequest.quizAudioData.optionsAudios &&
          quizRequest.quizAudioData.optionsAudios[index]
            ? quizRequest.quizAudioData.optionsAudios[index][optionIndex]
            : "<NOT CREATED>",
        text: optionText,
      })),
      correct_option_id: `${quizRequest.id}-q${index + 1}-opt${quizRequest.correctAnswers[index] + 1}`,
    })),
  });

  return quizData;
};

module.exports = {
  QuizData,
  getAllQuizData,
  getQuizById,
  fromQuizCreateRequest,
};
