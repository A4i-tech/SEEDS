import { contentService } from "../../src/services/contentService";
import { SEEDS_URL } from "../../src/Constants";

const mockAuthHeaders = {
  "Content-Type": "application/json",
  Authorization: "Bearer test-token",
};

// Mock authHelpers so getAuthHeaders is available in service (no localStorage in tests)
jest.mock("../../src/utils/authHelpers", () => ({
  getAuthHeaders: jest.fn(() => mockAuthHeaders),
}));

// Mock the api module
jest.mock("../../src/services/api", () => ({
  apiFetch: jest.fn(),
  buildQueryString: jest.fn((params) => {
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      if (params[key] !== null && params[key] !== undefined) {
        queryParams.append(key, params[key]);
      }
    });
    return queryParams.toString();
  }),
}));

describe("contentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("deleteContent", () => {
    it("should call delete endpoint with correct URL for quiz", async () => {
      const { apiFetch } = require("../../src/services/api");
      apiFetch.mockResolvedValue({});

      await contentService.deleteContent("quiz", "quiz-123");

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/content/quiz/quiz-123`,
        expect.objectContaining({
          method: "DELETE",
          headers: mockAuthHeaders,
        })
      );
    });

    it("should call delete endpoint with correct URL for non-quiz content", async () => {
      const { apiFetch } = require("../../src/services/api");
      apiFetch.mockResolvedValue({});

      await contentService.deleteContent("story", "story-123");

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/content/story-123`,
        expect.objectContaining({
          method: "DELETE",
          headers: mockAuthHeaders,
        })
      );
    });

    it("should include auth headers from getAuthHeaders", async () => {
      const { apiFetch } = require("../../src/services/api");
      apiFetch.mockResolvedValue({});

      await contentService.deleteContent("quiz", "quiz-123");

      expect(apiFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "DELETE",
          headers: mockAuthHeaders,
        })
      );
    });
  });
});
