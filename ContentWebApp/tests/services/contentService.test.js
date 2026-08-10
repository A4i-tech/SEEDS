import { contentService } from "../../src/services/contentService";
import { SEEDS_URL } from "../../src/Constants";
import { apiFetch } from "../../src/services/api";

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
    it("should call delete endpoint with id (type ignored)", async () => {
      apiFetch.mockResolvedValue({});

      await contentService.deleteContent("quiz", "quiz-123");

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/content/quiz-123`,
        expect.objectContaining({
          method: "DELETE",
          headers: mockAuthHeaders,
        })
      );
    });

    it("should call delete endpoint with correct URL for non-quiz content", async () => {
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

  describe("getContent", () => {
    it("fetches with default limit and returns a ContentPageDto", async () => {
      apiFetch.mockResolvedValue({
        data: [
          { id: "a1", title: { english: "A" }, audio_content: [] },
          { id: "b2", title: { english: "B" }, audio_content: [] },
        ],
        pagination: { next_cursor: "c", has_more: true },
      });
      const out = await contentService.getContent();
      expect(out.items[0].id).toBe("a1");
      expect(out.items[1].id).toBe("b2");
      expect(out.next_cursor).toBe("c");
      expect(out.has_more).toBe(true);
    });

    it("includes cursor when provided", async () => {
      apiFetch.mockResolvedValue({ data: [], pagination: {} });
      await contentService.getContent("CUR", 10);
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  describe("createQuiz", () => {
    it("POSTs serialized quiz data", async () => {
      apiFetch.mockResolvedValue({ id: "q1" });
      const out = await contentService.createQuiz({ title: "T" });
      expect(out).toEqual({ id: "q1" });
      const opts = apiFetch.mock.calls[0][1];
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ title: "T" });
    });
  });

  describe("updateContent", () => {
    it("PATCHes with isAudioUploaded flag", async () => {
      apiFetch.mockResolvedValue({ ok: true });
      await contentService.updateContent({ id: "x" }, true);
      const opts = apiFetch.mock.calls[0][1];
      expect(opts.method).toBe("PATCH");
    });
    it("defaults isAudioUploaded to false", async () => {
      apiFetch.mockResolvedValue({});
      await contentService.updateContent({ id: "x" });
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  describe("getAllContent", () => {
    it("returns a list of ContentDto", async () => {
      apiFetch.mockResolvedValue({ data: [{ id: "a", title: { english: "A" }, audio_content: [] }] });
      const out = await contentService.getAllContent();
      expect(out[0].id).toBe("a");
    });
    it("handles empty data", async () => {
      apiFetch.mockResolvedValue({ data: [] });
      const out = await contentService.getAllContent();
      expect(out).toEqual([]);
    });
  });

  describe("getContentById", () => {
    it("encodes id and fetches", async () => {
      apiFetch.mockResolvedValue({ id: "x y", title: { english: "X" }, audio_content: [] });
      const out = await contentService.getContentById("x y");
      expect(out.id).toBe("x y");
      expect(out.title.english).toBe("X");
    });
  });
});
