import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getRole, getAuthHeaders } from "../utils/authHelpers";

export const analyticsService = {
  /**
   * Get analytics data for a date range
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @param {Object} headers - Auth headers
   * @returns {Promise<{startDate: string, endDate: string, count: number, data: Array}>}
   */
  async getDashboard() {
    return apiFetch(`${SEEDS_URL}/tenant/dashboard`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async getSchoolDashboard() {
    return apiFetch(`${SEEDS_URL}/school/dashboard`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async getAnalytics(startDate, endDate, headers = {}) {
    if (!startDate || !endDate) {
      throw new Error("Both startDate and endDate are required");
    }

    const url =
      getRole() === "school_admin"
        ? `${SEEDS_URL}/school/analytics`
        : `${SEEDS_URL}/tenant/analytics`;

    const response = await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }),
    });

    return response;
  },
};
