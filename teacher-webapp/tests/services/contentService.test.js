import * as contentService from "../../src/services/contentService";
import { API_ENDPOINTS } from "../../src/constants/apiEndpoints";
import axiosInstance from "../../src/services/axiosInstance";

jest.mock("../../src/services/axiosInstance", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("contentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      axiosInstance.get.mockResolvedValueOnce({ data: mockContentResponse });

      const result = await contentService.getContent();

      expect(axiosInstance.get).toHaveBeenCalledWith(`${API_ENDPOINTS.GET_CONTENT}?limit=15`);
      expect(result).toEqual(mockContentResponse);
    });

    test("fetches content with query parameters", async () => {
      axiosInstance.get.mockResolvedValueOnce({ data: mockContentResponse });

      const result = await contentService.getContent({
        language: "en",
        theme: "Science",
        expName: "Story",
        limit: 20,
        cursor: "cursor-123",
      });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?language=en&theme=Science&expName=Story&limit=20&cursor=cursor-123`;
      expect(axiosInstance.get).toHaveBeenCalledWith(expectedUrl);
      expect(result).toEqual(mockContentResponse);
    });

    test("fetches content with onlyTeacherApp flag", async () => {
      axiosInstance.get.mockResolvedValueOnce({ data: mockContentResponse });

      await contentService.getContent({ onlyTeacherApp: true });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?onlyTeacherApp=true&limit=15`;
      expect(axiosInstance.get).toHaveBeenCalledWith(expectedUrl);
    });

    test("fetches content with ids array", async () => {
      axiosInstance.get.mockResolvedValueOnce({ data: mockContentResponse });

      await contentService.getContent({ ids: ["id1", "id2", "id3"] });

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT}?ids=id1%2Cid2%2Cid3&limit=15`;
      expect(axiosInstance.get).toHaveBeenCalledWith(expectedUrl);
    });

    test("propagates fetch errors", async () => {
      axiosInstance.get.mockRejectedValueOnce(new Error("Network Error"));

      await expect(contentService.getContent()).rejects.toThrow("Network Error");
    });
  });

  describe("getContentSasUrl", () => {
    const mockSasResponse = {
      url: "https://storage.blob.core.windows.net/container/blob?sv=2021-06-08&sig=...",
    };

    test("fetches SAS URL for audio URL", async () => {
      const audioUrl = "https://storage.blob.core.windows.net/container/blob.mp3";
      axiosInstance.get.mockResolvedValueOnce({ data: mockSasResponse });

      const result = await contentService.getContentSasUrl(audioUrl);

      const expectedUrl = `${API_ENDPOINTS.GET_CONTENT_SAS_URL}?url=${encodeURIComponent(audioUrl)}`;
      expect(axiosInstance.get).toHaveBeenCalledWith(expectedUrl);
      expect(result).toBe(mockSasResponse.url);
    });

    test("throws error when audioUrl is missing", async () => {
      await expect(contentService.getContentSasUrl(null)).rejects.toThrow("Audio URL is required");
      await expect(contentService.getContentSasUrl("")).rejects.toThrow("Audio URL is required");
    });

    test("propagates fetch errors", async () => {
      const audioUrl = "https://storage.blob.core.windows.net/container/blob.mp3";
      axiosInstance.get.mockRejectedValueOnce(new Error("Network Error"));

      await expect(contentService.getContentSasUrl(audioUrl)).rejects.toThrow("Network Error");
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
      axiosInstance.get.mockResolvedValueOnce({ data: mockContent });

      const result = await contentService.getContentById("content-123");

      expect(axiosInstance.get).toHaveBeenCalledWith(`${API_ENDPOINTS.GET_CONTENT}/content-123`);
      expect(result).toEqual(mockContent);
    });

    test("throws error when contentId is missing", async () => {
      await expect(contentService.getContentById(null)).rejects.toThrow("Content ID is required");
      await expect(contentService.getContentById("")).rejects.toThrow("Content ID is required");
    });

    test("propagates fetch errors", async () => {
      axiosInstance.get.mockRejectedValueOnce(new Error("Network Error"));

      await expect(contentService.getContentById("content-123")).rejects.toThrow("Network Error");
    });
  });
});
