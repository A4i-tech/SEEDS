import { SEEDS_URL, PLATFORM_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";
import { ContentDto, ContentPageDto } from "../dto/ContentDto";

export const contentService = {
  /**
   * Fetch paginated content
   * @param {string|null} cursor - Pagination cursor
   * @param {number} limit - Page size
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @returns {Promise<{data: Array, pagination: Object}>}
   */
  async getContent(cursor = null, limit = 50, signal = null) {
    const params = { limit };
    if (cursor) {
      params.cursor = cursor;
    }

    const queryString = buildQueryString(params);
    const url = `${SEEDS_URL}/content?${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
      signal,
    });

    return ContentPageDto.fromApi(response);
  },

  /**
   * Delete content by type and ID
   * @param {string} type - Content type ("quiz" or other)
   * @param {string} id - Content ID
   * @returns {Promise<void>}
   */
  async deleteContent(type, id) {
    const url = `${SEEDS_URL}/content/${id}`;

    await apiFetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Create or update a quiz
   * @param {Object} quizData
   * @returns {Promise<Object>}
   */
  async createQuiz(quizData) {
    const url = `${SEEDS_URL}/content/quiz`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(quizData),
    });

    return response;
  },

  /**
   * Update existing content
   * @param {Object} contentData
   * @param {boolean} isAudioUploaded
   * @returns {Promise<Object>}
   */
  async updateContent(contentData, isAudioUploaded = false) {
    const url = `${SEEDS_URL}/content?isAudioUploaded=${isAudioUploaded}`;

    const response = await apiFetch(url, {
      method: "PATCH",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contentData),
    });

    return response;
  },

  /**
   * Fetch all content
   * @returns {Promise<Array>}
   */
  async getAllContent() {
    const url = `${SEEDS_URL}/content`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const normalizedData = (response.data || response || []).map((item) => {
      if (!item.id && item._id) {
        return { ...item, id: item._id };
      }
      return item;
    });

    return normalizedData;
  },

  /**
   * Fetch content by ID
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async getContentById(id) {
    const url = `${SEEDS_URL}/content/${encodeURIComponent(id)}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }

    return response;
  },

  /**
   * Extract readable content from a website.
   * @param {string} url - Website URL
   * @returns {Promise<Object>}
   */
  async extractWebsite(url) {
    if (!url || !url.trim()) {
      throw new Error("Website URL is required");
    }

    return await apiFetch(`${PLATFORM_URL}/content/extract-website`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url.trim(),
      }),
    });
  },

  /**
   * Translate extracted website content.
   * @param {string} content - Extracted website text
   * @param {string} targetLanguage - Target language
   * @returns {Promise<Object>}
   */
  async translateWebsite(content, targetLanguage) {
    if (!content || !content.trim()) {
      throw new Error("Content is required");
    }

    return await apiFetch(`${PLATFORM_URL}/content/translate-website`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        targetLanguage,
      }),
    });
  },
};
