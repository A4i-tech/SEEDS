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

    // Normalize data: ensure all items have 'id' field (convert _id to id if needed)
    const normalizedData = (response.data || []).map((item) => {
      // If item has _id but no id, use _id as id
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
    let url;

    if (type === "quiz") {
      const params = buildQueryString({ id, type: "quiz" });
      url = `https://place-seeds.azurewebsites.net/byId?${params}`;
    } else {
      url = `${SEEDS_URL}/content/${id}`;
    }

    await apiFetch(url, {
      method: "DELETE",
      headers,
    });
  },
};
