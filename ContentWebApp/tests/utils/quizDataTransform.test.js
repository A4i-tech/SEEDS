import {
  transformQuizItem,
  normalizeQuizForTable,
} from "../../src/utils/quizDataTransform";

describe("quizDataTransform", () => {
  describe("transformQuizItem", () => {
    it("should add type field if missing", () => {
      const quiz = {
        _id: "quiz-1",
        title: "Test Quiz",
        language: "kannada",
      };

      const transformed = transformQuizItem(quiz);

      expect(transformed.type).toBe("quiz");
    });

    it("should preserve type field if present", () => {
      const quiz = {
        _id: "quiz-1",
        type: "quiz",
        title: "Test Quiz",
        language: "kannada",
      };

      const transformed = transformQuizItem(quiz);

      expect(transformed.type).toBe("quiz");
    });

    it("should ensure language field exists", () => {
      const quiz = {
        _id: "quiz-1",
        type: "quiz",
        title: "Test Quiz",
        language: "kannada",
      };

      const transformed = transformQuizItem(quiz);

      expect(transformed.language).toBe("kannada");
    });

    it("should handle missing language field", () => {
      const quiz = {
        _id: "quiz-1",
        type: "quiz",
        title: "Test Quiz",
      };

      const transformed = transformQuizItem(quiz);

      expect(transformed.language).toBe("");
    });
  });

  describe("normalizeQuizForTable", () => {
    it("should ensure quiz has all required fields for table display", () => {
      const quiz = {
        _id: "quiz-1",
        title: "Test Quiz",
        language: "kannada",
      };

      const normalized = normalizeQuizForTable(quiz);

      expect(normalized.type).toBe("quiz");
      expect(normalized.language).toBe("kannada");
      expect(normalized.id).toBeDefined();
      expect(normalized.title).toBeDefined();
      expect(normalized.theme).toBeDefined();
    });

    it("should ensure quiz has type field for filtering", () => {
      const quiz = {
        _id: "quiz-1",
        title: "Test Quiz",
        language: "kannada",
      };

      const normalized = normalizeQuizForTable(quiz);

      expect(normalized.type).toBe("quiz");
    });

    it("should ensure quiz has language field for filtering", () => {
      const quiz = {
        _id: "quiz-1",
        type: "quiz",
        title: "Test Quiz",
        language: "english",
      };

      const normalized = normalizeQuizForTable(quiz);

      expect(normalized.type).toBe("quiz");
      expect(normalized.language).toBe("english");
    });

    it("should handle quiz items missing language field", () => {
      const quiz = {
        _id: "quiz-1",
        type: "quiz",
        title: "Test Quiz",
      };

      const normalized = normalizeQuizForTable(quiz);

      expect(normalized.type).toBe("quiz");
      expect(normalized.language).toBe(""); // Defaults to empty string
    });
  });
});
