import {
  generateFilterOptions,
  applyFilters,
} from "../../src/utils/filterHelpers";

describe("filterHelpers", () => {
  describe("generateFilterOptions", () => {
    it("should generate filter options from content list", () => {
      const contentList = [
        { type: "story", language: "en" },
        { type: "quiz", language: "kn" },
        { type: "poem", language: "en" },
        { type: "quiz", language: "hi" },
      ];

      const options = generateFilterOptions(contentList);

      expect(options).toBeInstanceOf(Array);
      expect(options.length).toBeGreaterThan(0);

      // generateFilterOptions returns display labels via getLanguageLabel()
      const languageOptions = options.filter((opt) => opt.category === "Language");
      expect(languageOptions.length).toBeGreaterThan(0);
      expect(languageOptions.some((opt) => opt.name === "English")).toBe(true);
      expect(languageOptions.some((opt) => opt.name === "Kannada")).toBe(true);

      const experienceOptions = options.filter((opt) => opt.category === "Experience");
      expect(experienceOptions.length).toBeGreaterThan(0);
      expect(experienceOptions.some((opt) => opt.name.toLowerCase() === "quiz")).toBe(true);
      expect(experienceOptions.some((opt) => opt.name.toLowerCase() === "story")).toBe(true);
    });

    it("should include quiz type in filter options", () => {
      const contentList = [
        { type: "quiz", language: "kn" },
        { type: "story", language: "en" },
      ];

      const options = generateFilterOptions(contentList);
      const quizOption = options.find(
        (opt) => opt.category === "Experience" && opt.name.toLowerCase() === "quiz"
      );

      expect(quizOption).toBeDefined();
      expect(quizOption.category).toBe("Experience");
    });

    it("should handle empty content list", () => {
      const options = generateFilterOptions([]);
      expect(options).toEqual([]);
    });

    it("should handle content items without type or language", () => {
      const contentList = [
        { type: "quiz", language: "kn" },
        { type: "story" }, // missing language
        { language: "en" }, // missing type
        {}, // missing both
      ];

      const options = generateFilterOptions(contentList);
      expect(options.length).toBeGreaterThan(0);
    });
  });

  describe("applyFilters", () => {
    const mockContent = [
      { id: "1", type: "quiz", language: "kn", title: "Quiz 1" },
      { id: "2", type: "quiz", language: "en", title: "Quiz 2" },
      { id: "3", type: "story", language: "kn", title: "Story 1" },
      { id: "4", type: "poem", language: "en", title: "Poem 1" },
    ];

    // Filter chips use display labels (e.g. "Kannada", "English")
    const mockOptions = [
      { category: "Language", name: "Kannada", id: 1 },
      { category: "Language", name: "English", id: 2 },
      { category: "Experience", name: "Quiz", id: 3 },
      { category: "Experience", name: "Story", id: 4 },
      { category: "Experience", name: "Poem", id: 5 },
    ];

    it("should filter by quiz type", () => {
      const selectedFilters = [
        { category: "Experience", name: "Quiz", id: 3 },
      ];

      const filtered = applyFilters(mockContent, selectedFilters, mockOptions);

      expect(filtered.length).toBe(2);
      expect(filtered.every((item) => item.type.toLowerCase() === "quiz")).toBe(true);
      expect(filtered.some((item) => item.id === "1")).toBe(true);
      expect(filtered.some((item) => item.id === "2")).toBe(true);
    });

    it("should filter by language (Kannada)", () => {
      const selectedFilters = [
        { category: "Language", name: "Kannada", id: 1 },
      ];

      const filtered = applyFilters(mockContent, selectedFilters, mockOptions);

      expect(filtered.length).toBe(2);
      expect(filtered.every((item) => item.language === "kn")).toBe(true);
      expect(filtered.some((item) => item.id === "1")).toBe(true);
      expect(filtered.some((item) => item.id === "3")).toBe(true);
    });

    it("should filter by quiz type and language combined", () => {
      const selectedFilters = [
        { category: "Experience", name: "Quiz", id: 3 },
        { category: "Language", name: "Kannada", id: 1 },
      ];

      const filtered = applyFilters(mockContent, selectedFilters, mockOptions);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("1");
      expect(filtered[0].type.toLowerCase()).toBe("quiz");
      expect(filtered[0].language).toBe("kn");
    });

    it("should return all content when no filters selected", () => {
      const filtered = applyFilters(mockContent, [], mockOptions);
      const itemsWithBothFields = mockContent.filter(
        (item) => item.type && item.language
      );
      expect(filtered.length).toBe(itemsWithBothFields.length);
      expect(filtered.every((item) => item.type && item.language)).toBe(true);
    });

    it("should handle empty content list", () => {
      const filtered = applyFilters([], [], mockOptions);
      expect(filtered).toEqual([]);
    });

    it("should filter quiz items correctly (experience only)", () => {
      const quizContent = [
        { id: "q1", type: "quiz", language: "kn", title: "Math Quiz" },
        { id: "q2", type: "quiz", language: "en", title: "Science Quiz" },
        { id: "s1", type: "story", language: "kn", title: "Story" },
      ];

      const selectedFilters = [{ category: "Experience", name: "Quiz", id: 3 }];

      const filtered = applyFilters(quizContent, selectedFilters, mockOptions);

      expect(filtered.length).toBe(2);
      expect(filtered.every((item) => item.type.toLowerCase() === "quiz")).toBe(true);
    });
  });
});
