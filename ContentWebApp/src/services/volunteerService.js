import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getAuthHeaders } from "../utils/authHelpers";

export const volunteerService = {
  async getVolunteers() {
    return apiFetch(`${SEEDS_URL}/tenant/volunteers`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async createVolunteer(name, email, password) {
    return apiFetch(`${SEEDS_URL}/tenant/volunteers`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, password }),
    });
  },
};
