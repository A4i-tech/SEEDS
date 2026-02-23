import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

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

    // Normalize data: ensure all items have "id" field (backend should always provide id, but keep as safety check)
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
   * @param {string} type - Content type ("quiz" or other)
   * @param {string} id - Content ID
   * @returns {Promise<void>}
   */
  async deleteContent(type, id) {
    // All content (including quizzes) is now deleted through the main endpoint
    const url = `${SEEDS_URL}/content/${id}`;

    await apiFetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Create or update a quiz
   * @param {Object} quizData - Quiz metadata and questions
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
   * Update existing content (quiz or story) via PATCH
   * @param {Object} contentData - Content with _id field required
   * @param {boolean} isAudioUploaded - Whether a new audio file was uploaded
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
   * Fetch all content (without pagination) - for bulk operations
   * @returns {Promise<Array>}
   */
  async getAllContent() {
    const url = `${SEEDS_URL}/content`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    // Normalize data: ensure all items have "id" field
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
   * @returns {Promise<Object>}
   */
  async getContentById(id) {
    if (!id || !String(id).trim()) {
      throw new Error("Content ID is required");
    }

    const contentId = encodeURIComponent(String(id).trim());
    const url = `${SEEDS_URL}/content/${contentId}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response;
  },
};
