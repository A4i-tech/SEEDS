import { SEEDS_URL } from "../Constants";
import { apiFetch, buildQueryString } from "./api";
import { getRole, getAuthHeaders } from "../utils/authHelpers";
import { downloadBlob } from "../utils/exportHelpers";

const analyticsBaseUrl = () =>
  getRole() === "school_admin" ? `${SEEDS_URL}/school/analytics` : `${SEEDS_URL}/tenant/analytics`;

const buildAnalyticsQuery = (startDate, endDate, filters = {}) => {
  if (!startDate || !endDate) {
    throw new Error("Both startDate and endDate are required");
  }
  return buildQueryString({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    schoolId: filters.schoolId || null,
    teacherId: filters.teacherId || null,
  });
};

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

  async getIvrAnalytics(startDate, endDate, filters = {}, headers = {}) {
    const query = buildAnalyticsQuery(startDate, endDate, filters);
    return apiFetch(`${analyticsBaseUrl()}/ivr?${query}`, {
      method: "GET",
      headers,
    });
  },

  async getConferenceAnalytics(startDate, endDate, filters = {}, headers = {}) {
    const query = buildAnalyticsQuery(startDate, endDate, filters);
    return apiFetch(`${analyticsBaseUrl()}/conference?${query}`, {
      method: "GET",
      headers,
    });
  },

  /**
   * Download a CSV export of an analytics section.
   * Uses raw fetch because apiFetch parses responses as JSON/text.
   * @param {"ivr"|"conference"} kind
   * @param {string} section - Backend CSV section (e.g. "calls", "byTeacher")
   */
  async exportAnalyticsCSV(kind, section, startDate, endDate, filters = {}, headers = {}) {
    const query = buildAnalyticsQuery(startDate, endDate, filters);
    const url = `${analyticsBaseUrl()}/${kind}?${query}&format=csv&section=${section}`;
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`Export failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const datePart = `${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}`;
    downloadBlob(blob, `${kind}-analytics-${section}-${datePart}.csv`);
  },
};
