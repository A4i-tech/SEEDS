import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { request } from "./requestHelpers";
import { toLanguageCreateRequest, toLanguageUpdateRequest } from "./dtos/localizationRequests";
import { fromLanguageResponse } from "./dtos/localizationResponses";

export const languageService = {
  async listLanguages() {
    const url = `${SEEDS_URL}/languages?enabledOnly=false`;

    const response = await request(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromLanguageResponse);
  },

  async createLanguage({ name, code, direction, enabled }) {
    const url = `${SEEDS_URL}/languages`;

    const response = await request(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toLanguageCreateRequest({ name, code, direction, enabled })),
    });

    return fromLanguageResponse(response);
  },

  async updateLanguage(id, fields) {
    const url = `${SEEDS_URL}/languages/${id}`;

    const response = await request(url, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(toLanguageUpdateRequest(fields)),
    });

    return fromLanguageResponse(response);
  },

  async deleteLanguage(id) {
    const url = `${SEEDS_URL}/languages/${id}`;

    return request(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
