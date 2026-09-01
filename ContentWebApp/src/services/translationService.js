import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

export const translationService = {
  /**
   * Submit extracted source phrases so the backend persists a per-phrase
   * translation record for each (siteId, route, key). Same public endpoint the
   * runtime SDK posts to — reused here so the Translate flow produces real,
   * reviewable records instead of a throwaway blob.
   * @param {string} siteId
   * @param {Array<{key:string,text:string,route:string,sourceLang?:string}>} items
   */
  async extractItems(siteId, items) {
    return apiFetch(`${SEEDS_URL}/translations/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, items }),
    });
  },

  /**
   * Runtime translation delivery for a route+language. Triggers on-demand
   * generation for any missing phrase and returns { key: text }. Same endpoint
   * the SDK uses at language switch.
   */
  async getRuntimeTranslations(siteId, route, lang) {
    const queryString = buildQueryString({ siteId, route, lang });
    return apiFetch(`${SEEDS_URL}/translations?${queryString}`, { method: "GET" });
  },

  /**
   * Append-only audit trail for a single translated phrase (who translated /
   * edited / approved / rejected, and when) — the real Activity Timeline source.
   * @param {Object} params - { siteId, route, key }
   * @returns {Promise<Array>}
   */
  async getAuditTrail({ siteId, route, key } = {}) {
    const queryString = buildQueryString({ siteId, route, key });
    return apiFetch(`${SEEDS_URL}/translations/audit?${queryString}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * List translation documents for reviewer/admin workflows
   * @param {Object} params - { siteId (required), route, status }
   * @returns {Promise<Array>}
   */
  async listTranslations({ siteId, route, status } = {}) {
    const queryString = buildQueryString({ siteId, route, status });
    const url = `${SEEDS_URL}/translations/list?${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    // Normalize data: ensure all items have "id" field
    return (response || []).map((item) => {
      if (!item.id && item._id) {
        return { ...item, id: item._id };
      }
      return item;
    });
  },

  /**
   * Get a single translation document for review
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async getTranslation(id) {
    const url = `${SEEDS_URL}/translations/${id}`;

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
   * Get the approved version history of a translation
   * @param {string} id
   * @returns {Promise<Array>}
   */
  async getVersions(id) {
    const url = `${SEEDS_URL}/translations/${id}/versions`;

    return apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Update a translation's edited text
   * @param {string} id
   * @param {string} lang
   * @param {string} text
   * @returns {Promise<Object>}
   */
  async updateTranslation(id, lang, text) {
    const url = `${SEEDS_URL}/translations/${id}`;

    const response = await apiFetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lang, text }),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },

  /**
   * Approve a reviewed translation
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async approveTranslation(id) {
    const url = `${SEEDS_URL}/translations/${id}/approve`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },

  /**
   * Reject a translation, returning it to draft for re-edit
   * @param {string} id
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async rejectTranslation(id, reason = "") {
    const url = `${SEEDS_URL}/translations/${id}/reject`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },
};
