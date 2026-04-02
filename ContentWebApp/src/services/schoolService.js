import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getAuthHeaders } from "../utils/authHelpers";

export const schoolService = {
  async getSchools() {
    return apiFetch(`${SEEDS_URL}/school`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async createSchool(name, email, password) {
    return apiFetch(`${SEEDS_URL}/school`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, password }),
    });
  },

  async updateSchool(schoolId, name, email, password) {
    const body = { name, email };
    if (password) body.password = password;
    return apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
  },

  async deleteSchool(schoolId) {
    return apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
