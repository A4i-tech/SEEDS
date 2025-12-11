import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";

export const analyticsService = {
  /**
   * Get analytics data for a date range
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @param {Object} headers - Auth headers
   * @returns {Promise<{startDate: string, endDate: string, count: number, data: Array}>}
   */
  async getAnalytics(startDate, endDate, headers = {}) {
    if (!startDate || !endDate) {
      throw new Error("Both startDate and endDate are required");
    }

    const tenantId = localStorage.getItem("tenantId");
    if (!tenantId) {
      throw new Error("Tenant ID not found. Please log in again.");
    }

    const url = `${SEEDS_URL}/tenant/analytics`;

    const response = await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        tenantId: tenantId,
      }),
    });

    return response;
  },
};
