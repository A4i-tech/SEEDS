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

    // Normalize data: ensure all items have "id" field
    const normalizedData = response.data.map((item) => {
      if (!item.id && item._id) {
        return { ...item, id: item._id };
      }
      return item;
    });

    return {
      data: normalizedData,
      pagination: response.pagination,
    };
  },

  /**
   * Delete content by ID
   * @param {string} _type - Unused (kept for call-site compat)
   * @param {string} id - Content ID
   * @returns {Promise<void>}
   */
  async deleteContent(_type, id) {
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
   * Update existing content (quiz or story) via PATCH.
   * Dispatches by type to /content/quiz/:id or /content/:id.
   * @param {Object} contentData - Content with _id and type fields
   * @param {boolean} isAudioUploaded - Whether a new audio file was uploaded
   * @returns {Promise<Object>}
   */
  async updateContent(contentData, isAudioUploaded = false) {
    if (!contentData?._id) {
      throw new Error("updateContent requires _id");
    }
    const url = `${SEEDS_URL}/content/${contentData._id}?isAudioUploaded=${isAudioUploaded}`;

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
