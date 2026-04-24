"use strict";

const contentService = require("../../src/services/content.service");

describe("content.service", () => {
  test("sanitizePatchableContentFields keeps allowed fields and strips protected fields", () => {
    const payload = contentService.sanitizePatchableContentFields({
      title: "Allowed",
      description: "Allowed",
      createdBy: "blocked-user",
      isDeleted: true,
      isProcessed: true,
    });

    expect(payload).toEqual({
      title: "Allowed",
      description: "Allowed",
    });
  });

  test("buildQuizUpdatePayload normalizes marks and nested title/theme fields", () => {
    const existingQuiz = {
      title: { local: "Old local title", audioUrl: "title-audio" },
      theme: { local: "Old local theme", audioUrl: "theme-audio" },
      questions: [
        {
          question: { id: "q1", url: "q1-audio", text: "Old question" },
          options: [
            { id: "o1", url: "o1-audio", text: "Old option 1" },
            { id: "o2", url: "o2-audio", text: "Old option 2" },
          ],
        },
      ],
    };

    const payload = contentService.buildQuizUpdatePayload(existingQuiz, {
      language: "english",
      positiveMark: 5,
      negativeMarks: 1,
      title: { english: "New title" },
      localTitle: "New local title",
      theme: "New theme",
      questions: ["Question 1"],
      options: [["Option 1", "Option 2"]],
      correctAnswers: [1],
    });

    expect(payload.language).toBe("english");
    expect(payload.positiveMarks).toBe(5);
    expect(payload.negativeMarks).toBe(1);
    expect(payload.title).toEqual({
      english: "New title",
      local: "New local title",
      audioUrl: "title-audio",
    });
    expect(payload.theme).toEqual({
      english: "New theme",
      local: "Old local theme",
      audioUrl: "theme-audio",
    });
    expect(payload.questions).toEqual([
      {
        question: { id: "q1", url: "q1-audio", text: "Question 1" },
        options: [
          { id: "o1", url: "o1-audio", text: "Option 1" },
          { id: "o2", url: "o2-audio", text: "Option 2" },
        ],
        correct_option_id: "o2",
      },
    ]);
  });

  test("buildQuizUpdatePayload rejects invalid title values", () => {
    expect(() =>
      contentService.buildQuizUpdatePayload(
        { title: {}, theme: {} },
        { title: { local: "missing english" } },
      ),
    ).toThrow("title must be a string or an object with english string");
  });

  test("buildStoryUpdatePayload marks content unprocessed only when audio changes", () => {
    const basePayload = { title: "Story", description: "Body" };

    expect(contentService.buildStoryUpdatePayload(basePayload, { isAudioUploaded: false })).toEqual(
      basePayload,
    );
    expect(contentService.buildStoryUpdatePayload(basePayload, { isAudioUploaded: true })).toEqual({
      title: "Story",
      description: "Body",
      isProcessed: false,
    });
  });
});
