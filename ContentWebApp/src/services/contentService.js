import { SEEDS_URL } from "../Constants";
import { apiFetch, buildQueryString } from "./api";

export const contentService = {
  /**
   * Fetch paginated content
   * @param {string|null} cursor - Pagination cursor
   * @param {Object} headers - Auth headers
   * @param {number} limit - Page size
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @returns {Promise<{data: Array, pagination: Object}>}
   */
  async getContent(cursor = null, headers = {}, limit = 50, signal = null) {
    const params = { limit };
    if (cursor) {
      params.cursor = cursor;
    }

    const queryString = buildQueryString(params);
    const url = `${SEEDS_URL}/content?${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers,
      signal,
    });

    // Normalize data: ensure all items have 'id' field (backend should always provide id, but keep as safety check)
    const normalizedData = (response.data || []).map((item) => {
      // Safety fallback: if item has _id but no id, use _id as id (should not happen with standardized backend)
      if (!item.id && item._id) {
        return { ...item, id: item._id };
      }
      return item;
    });

    return {
      data: normalizedData,
      pagination: response.pagination || {},
    };
  },

  /**
   * Delete content by type and ID
   * @param {string} type - Content type ('quiz' or other)
   * @param {string} id - Content ID
   * @param {Object} headers - Auth headers
   * @returns {Promise<void>}
   */
  async deleteContent(type, id, headers = {}) {
    // All content (including quizzes) is now deleted through the main endpoint
    const url = `${SEEDS_URL}/content/${id}`;

    await apiFetch(url, {
      method: "DELETE",
      headers,
    });
  },

  /**
   * Create or update a quiz
   * @param {Object} quizData - Quiz metadata and questions
   * @param {Object} headers - Auth headers
   * @returns {Promise<Object>}
   */
  async createQuiz(quizData, headers = {}) {
    const url = `${SEEDS_URL}/content/quiz`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(quizData),
    });

    return response;
  },

  /**
   * Fetch all content (without pagination) - for bulk operations
   * @param {Object} headers - Auth headers
   * @returns {Promise<Array>}
   */
  async getAllContent(headers = {}) {
    const url = `${SEEDS_URL}/content`;

    const response = await apiFetch(url, {
      method: "GET",
      headers,
    });

    // Normalize data: ensure all items have 'id' field
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
   * @param {string} id - Content ID
   * @param {Object} headers - Auth headers
   * @returns {Promise<Object>}
   */
  async getContentById(id, headers = {}) {
    if (!id || !String(id).trim()) {
      throw new Error("Content ID is required");
    }

    const contentId = encodeURIComponent(String(id).trim());
    const url = `${SEEDS_URL}/content/${contentId}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers,
    });

    return response;
  },
};
