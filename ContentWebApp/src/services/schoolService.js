import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getAuthHeaders } from "../utils/authHelpers";
import { SchoolDto } from "../dto/SchoolDto";

export const schoolService = {
  async getSchools() {
    const response = await apiFetch(`${SEEDS_URL}/school`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    return SchoolDto.listFromApi(response);
  },

  async createSchool(name, email, password) {
    const response = await apiFetch(`${SEEDS_URL}/school`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, password }),
    });
    return SchoolDto.fromApi(response);
  },

  async updateSchool(schoolId, name, email, password) {
    const body = { name, email };
    if (password) body.password = password;
    const response = await apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return SchoolDto.fromApi(response);
  },

  async deleteSchool(schoolId) {
    return apiFetch(`${SEEDS_URL}/school/${schoolId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
