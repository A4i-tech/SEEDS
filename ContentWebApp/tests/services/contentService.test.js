import { contentService } from "../../src/services/contentService";
import { SEEDS_URL } from "../../src/Constants";

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

      await contentService.deleteContent("quiz", "quiz-123", {});

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/content/quiz-123`,
        expect.objectContaining({
          method: "DELETE",
          headers: {},
        })
      );
    });

    it("should call delete endpoint with correct URL for non-quiz content", async () => {
      const { apiFetch } = require("../../src/services/api");
      apiFetch.mockResolvedValue({});

      await contentService.deleteContent("story", "story-123", {});

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/content/story-123`,
        expect.objectContaining({
          method: "DELETE",
          headers: {},
        })
      );
    });

    it("should include auth headers when provided", async () => {
      const { apiFetch } = require("../../src/services/api");
      apiFetch.mockResolvedValue({});

      const headers = { Authorization: "Bearer token123" };

      await contentService.deleteContent("quiz", "quiz-123", headers);

      expect(apiFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "DELETE",
          headers,
        })
      );
    });
  });
});

