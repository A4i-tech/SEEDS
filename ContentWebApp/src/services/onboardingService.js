import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { request } from "./requestHelpers";
import { toSiteCreateRequest, toSiteUpdateRequest, fromSiteResponse } from "../dto/LocalizationDto";

export const onboardingService = {
  async createSite({ domain, name, status }) {
    const url = `${SEEDS_URL}/websites`;

    const response = await request(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toSiteCreateRequest({ domain, name, status })),
    });

    return fromSiteResponse(response);
  },

  async listSites() {
    const url = `${SEEDS_URL}/websites`;

    const response = await request(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromSiteResponse);
  },

  async getSite(id) {
    const response = await request(`${SEEDS_URL}/websites/${id}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return fromSiteResponse(response);
  },

  async updateSite(id, fields) {
    const url = `${SEEDS_URL}/websites/${id}`;

    const response = await request(url, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(toSiteUpdateRequest(fields)),
    });

    return fromSiteResponse(response);
  },

  async deleteSite(id) {
    const url = `${SEEDS_URL}/websites/${id}`;

    return request(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
