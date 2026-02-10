import * as contentService from "../../src/services/contentService";
import { API_ENDPOINTS } from "../../src/constants/apiEndpoints";

// Mock fetch globally
global.fetch = jest.fn();

// Mock getAuthHeaders
jest.mock("../../src/utils/authHelpers", () => ({
  getAuthHeaders: jest.fn(() => ({
    "Content-Type": "application/json",
    Authorization: "Bearer test-token",
  })),
}));

// Mock environment variables
process.env.REACT_APP_API_BASE_URL = "http://localhost:3000";

describe("contentService", () => {
  const mockSuccessResponse = (data) => ({
    ok: true,
    json: jest.fn().mockResolvedValueOnce(data),
  });

  const mockErrorResponse = (status = 400, message = "Error") => ({
    ok: false,
    status,
    statusText: message,
    json: jest.fn().mockResolvedValueOnce({ error: message }),
  });

  beforeEach(() => {
    fetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getContent", () => {
    const mockContentResponse = {
      data: [
        {
          _id: "content-1",
          title: { english: "Test Content", local: "Test Local" },
          type: "Story",
          language: "en",
        },
      ],
      pagination: {
        nextCursor: "cursor-123",
        hasMore: true,
        limit: 15,
      },
    };

    test("fetches content with default parameters", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockContentResponse));

      const result = await contentService.getContent();

      expect(fetch).toHaveBeenCalledWith(
        `${API_ENDPOINTS.GET_CONTENT}?limit=15`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        }
      );
      expect(result).toEqual(mockContentResponse);
    });

    test("fetches content with query parameters", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockContentResponse));

      const result = await contentService.getContent({
        language: "en",
        theme: "Science",
        expName: "Story",
        limit: 20,
        cursor: "cursor-123",
      });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?language=en&theme=${encodeURIComponent("Science")}&expName=Story&limit=20&cursor=cursor-123`;
      expect(fetch).toHaveBeenCalledWith(expectedUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
      });
      expect(result).toEqual(mockContentResponse);
    });

    test("fetches content with onlyTeacherApp flag", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockContentResponse));

      await contentService.getContent({ onlyTeacherApp: true });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?onlyTeacherApp=true&limit=15`;
      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    test("fetches content with ids array", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockContentResponse));

      await contentService.getContent({ ids: ["id1", "id2", "id3"] });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?ids=id1%2Cid2%2Cid3&limit=15`;
      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    test("handles fetch errors", async () => {
      fetch.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

      await expect(contentService.getContent()).rejects.toThrow(
        "Failed to fetch content"
      );
    });
  });

  describe("getContentSasUrl", () => {
    const mockSasResponse = {
      url: "https://storage.blob.core.windows.net/container/blob?sv=2021-06-08&sig=...",
    };

    test("fetches SAS URL for audio URL", async () => {
      const audioUrl = "https://storage.blob.core.windows.net/container/blob.mp3";
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockSasResponse));

      const result = await contentService.getContentSasUrl(audioUrl);

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT_SAS_URL}?url=${encodeURIComponent(audioUrl)}`;
      expect(fetch).toHaveBeenCalledWith(expectedUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
      });
      expect(result).toBe(mockSasResponse.url);
    });

    test("throws error when audioUrl is missing", async () => {
      await expect(contentService.getContentSasUrl(null)).rejects.toThrow(
        "Audio URL is required"
      );
      await expect(contentService.getContentSasUrl("")).rejects.toThrow(
        "Audio URL is required"
      );
    });

    test("handles fetch errors", async () => {
      const audioUrl = "https://storage.blob.core.windows.net/container/blob.mp3";
      fetch.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

      await expect(contentService.getContentSasUrl(audioUrl)).rejects.toThrow(
        "Failed to fetch SAS URL"
      );
    });
  });

  describe("getContentById", () => {
    const mockContent = {
      _id: "content-123",
      title: { english: "Test Content", local: "Test Local" },
      type: "Story",
      language: "en",
      description: "Test description",
    };

    test("fetches content by ID", async () => {
      fetch.mockResolvedValueOnce(mockSuccessResponse(mockContent));

      const result = await contentService.getContentById("content-123");

      expect(fetch).toHaveBeenCalledWith(
        `${API_ENDPOINTS.GET_CONTENT}/content-123`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        }
      );
      expect(result).toEqual(mockContent);
    });

    test("throws error when contentId is missing", async () => {
      await expect(contentService.getContentById(null)).rejects.toThrow(
        "Content ID is required"
      );
      await expect(contentService.getContentById("")).rejects.toThrow(
        "Content ID is required"
      );
    });

    test("handles 404 error", async () => {
      fetch.mockResolvedValueOnce(mockErrorResponse(404, "Not Found"));

      await expect(contentService.getContentById("invalid-id")).rejects.toThrow(
        "Content not found"
      );
    });

    test("handles other fetch errors", async () => {
      fetch.mockResolvedValueOnce(mockErrorResponse(500, "Server Error"));

      await expect(contentService.getContentById("content-123")).rejects.toThrow(
        "Failed to fetch content"
      );
    });
  });
});
