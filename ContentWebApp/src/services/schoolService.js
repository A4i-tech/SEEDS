import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getAuthHeaders } from "../utils/authHelpers";
import {
  parseSchoolListResponse,
  parseSchoolResponse,
  buildSchoolCreateRequest,
  buildSchoolUpdateRequest,
} from "../dto/index.js";

export const schoolService = {
  async getSchools() {
    const raw = await apiFetch(`${SEEDS_URL}/school`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    return parseSchoolListResponse(raw);
  },

  async createSchool(name, email, password) {
    const body = buildSchoolCreateRequest(name, email, password);
    const raw = await apiFetch(`${SEEDS_URL}/school`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return parseSchoolResponse(raw);
  },

  async updateSchool(schoolId, name, email, password) {
    const body = buildSchoolUpdateRequest(name, email, password);
    const raw = await apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return parseSchoolResponse(raw);
  },

  async deleteSchool(schoolId) {
    return apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
