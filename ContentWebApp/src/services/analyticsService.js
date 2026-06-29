import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getRole, getAuthHeaders } from "../utils/authHelpers";
import {
  parseAnalyticsResponse,
  buildTenantAnalyticsRequest,
  buildSchoolAnalyticsRequest,
} from "../dto/index.js";

export const analyticsService = {
  /**
   * Get tenant dashboard data
   * @returns {Promise<import('../dto/analytics.dto.js').AnalyticsResponse>}
   */
  async getDashboard() {
    return apiFetch(`${SEEDS_URL}/tenant/dashboard`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Get school dashboard data
   */
  async getSchoolDashboard() {
    return apiFetch(`${SEEDS_URL}/school/dashboard`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Get analytics data for a date range
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @param {Object} headers - Auth headers
   * @returns {Promise<import('../dto/analytics.dto.js').AnalyticsResponse>}
   */
  async getAnalytics(startDate, endDate, headers = {}) {
    if (!startDate || !endDate) {
      throw new Error("Both startDate and endDate are required");
    }

    const url =
      getRole() === "school_admin"
        ? `${SEEDS_URL}/school/analytics`
        : `${SEEDS_URL}/tenant/analytics`;

    const buildRequest = getRole() === "school_admin"
      ? buildSchoolAnalyticsRequest
      : buildTenantAnalyticsRequest;

    const body = buildRequest(startDate.toISOString(), endDate.toISOString());

    const raw = await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return parseAnalyticsResponse(raw);
  },
};
