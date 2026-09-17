import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { buildQueryString } from "./api";
import { request } from "./requestHelpers";
import { toProjectCreateRequest, toProjectUpdateRequest, toSiteCreateRequest, toSiteUpdateRequest } from "./dtos/localizationRequests";
import { fromProjectResponse, fromSiteResponse } from "./dtos/localizationResponses";

export const onboardingService = {
  async createProject({ name, description, sourceLanguage, status }) {
    const url = `${SEEDS_URL}/projects`;

    const response = await request(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toProjectCreateRequest({ name, description, sourceLanguage, status })),
    });

    return fromProjectResponse(response);
  },

  async listProjects() {
    const url = `${SEEDS_URL}/projects`;

    const response = await request(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromProjectResponse);
  },

  async updateProject(id, fields) {
    const url = `${SEEDS_URL}/projects/${id}`;

    const response = await request(url, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(toProjectUpdateRequest(fields)),
    });

    return fromProjectResponse(response);
  },

  async deleteProject(id) {
    const url = `${SEEDS_URL}/projects/${id}`;

    return request(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  async createSite({ projectId, domain, name, status }) {
    const url = `${SEEDS_URL}/websites`;

    const response = await request(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toSiteCreateRequest({ projectId, domain, name, status })),
    });

    return fromSiteResponse(response);
  },

  async listSites(projectId) {
    const queryString = projectId ? `?${buildQueryString({ projectId })}` : "";
    const url = `${SEEDS_URL}/websites${queryString}`;

    const response = await request(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromSiteResponse);
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
