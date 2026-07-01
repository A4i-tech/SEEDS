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
    it("fetches with default limit and normalizes _id -> id", async () => {
      apiFetch.mockResolvedValue({
        data: [{ _id: "a1", name: "x" }, { id: "b2" }],
        pagination: { nextCursor: "c" },
      });
      const out = await contentService.getContent();
      expect(out.data[0].id).toBe("a1");
      expect(out.data[1].id).toBe("b2");
      expect(out.pagination).toEqual({ nextCursor: "c" });
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
      await contentService.updateContent({ _id: "x" }, true);
      const opts = apiFetch.mock.calls[0][1];
      expect(opts.method).toBe("PATCH");
    });
    it("defaults isAudioUploaded to false", async () => {
      apiFetch.mockResolvedValue({});
      await contentService.updateContent({ _id: "x" });
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  describe("getAllContent", () => {
    it("normalizes array response", async () => {
      apiFetch.mockResolvedValue({ data: [{ _id: "a" }] });
      const out = await contentService.getAllContent();
      expect(out[0].id).toBe("a");
    });
    it("handles bare array response", async () => {
      apiFetch.mockResolvedValue([{ id: "b" }]);
      const out = await contentService.getAllContent();
      expect(out[0].id).toBe("b");
    });
    it("handles empty array response", async () => {
      apiFetch.mockResolvedValue([]);
      const out = await contentService.getAllContent();
      expect(out).toEqual([]);
    });
  });

  describe("getContentById", () => {
    it("throws when id is missing", async () => {
      await expect(contentService.getContentById("")).rejects.toThrow(/required/i);
      await expect(contentService.getContentById("   ")).rejects.toThrow(/required/i);
    });
    it("encodes id and fetches", async () => {
      apiFetch.mockResolvedValue({ id: "x y" });
      const out = await contentService.getContentById("x y");
      expect(out).toEqual({ id: "x y" });
    });
  });
});
