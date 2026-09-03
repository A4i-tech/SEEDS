import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch } from "./api";
import { toLanguageCreateRequest, toLanguageUpdateRequest } from "./dtos/localizationRequests";
import { fromLanguageResponse } from "./dtos/localizationResponses";

export const languageService = {
  /**
   * List all languages (admin view — includes disabled)
   * @returns {Promise<Array>}
   */
  async listLanguages() {
    const url = `${SEEDS_URL}/languages?enabledOnly=false`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return fromLanguageResponse(response);
  },

  /**
   * Create a new language
   * @param {Object} params - { name, code, direction, enabled }
   * @returns {Promise<Object>}
   */
  async createLanguage({ name, code, direction, enabled }) {
    const url = `${SEEDS_URL}/languages`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toLanguageCreateRequest({ name, code, direction, enabled })),
    });

    return fromLanguageResponse(response);
  },

  /**
   * Update a language
   * @param {string} id
   * @param {Object} fields
   * @returns {Promise<Object>}
   */
  async updateLanguage(id, fields) {
    const url = `${SEEDS_URL}/languages/${id}`;

    const response = await apiFetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toLanguageUpdateRequest(fields)),
    });

    return fromLanguageResponse(response);
  },

  /**
   * Delete a language
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteLanguage(id) {
    const url = `${SEEDS_URL}/languages/${id}`;

    return apiFetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
