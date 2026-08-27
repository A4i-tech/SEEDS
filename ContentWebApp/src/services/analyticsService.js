import { SEEDS_URL } from "../Constants";
import { apiFetch, buildQueryString } from "./api";
import { getRole, getAuthHeaders } from "../utils/authHelpers";

// Role -> analytics path prefix. Platform exposes /school/analytics/* for
// school_admin and /tenant/analytics/* for tenant (see analytics_controller.py).
const analyticsPrefix = () => (getRole() === "school_admin" ? "school" : "tenant");

/**
 * Build the query string shared by both analytics endpoints.
 * startDate/endDate are required; schoolId/teacherId are optional filters
 * (schoolId is only honoured for the tenant role).
 */
const buildAnalyticsQuery = ({ startDate, endDate, schoolId, teacherId }) => {
  if (!startDate || !endDate) {
    throw new Error("Both startDate and endDate are required");
  }
  return buildQueryString({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    schoolId: schoolId || undefined,
    teacherId: teacherId || undefined,
  });
};

export const analyticsService = {
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

  /**
   * IVR usage analytics (server-aggregated).
   * @returns totals, sessionLength, statusBreakdown, bySchool, byTeacher,
   *          contentUsage, calls
   */
  async getIvrAnalytics(filters, headers = getAuthHeaders()) {
    const query = buildAnalyticsQuery(filters);
    return apiFetch(`${SEEDS_URL}/${analyticsPrefix()}/analytics/ivr?${query}`, {
      method: "GET",
      headers,
    });
  },

  /**
   * Conference usage analytics (server-aggregated).
   * @returns totals, duration, classSize, raisedHands, byTeacher, conferences
   */
  async getConferenceAnalytics(filters, headers = getAuthHeaders()) {
    const query = buildAnalyticsQuery(filters);
    return apiFetch(`${SEEDS_URL}/${analyticsPrefix()}/analytics/conference?${query}`, {
      method: "GET",
      headers,
    });
  },
};
