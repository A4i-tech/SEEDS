import { SEEDS_URL } from "../Constants";
import { apiFetch, buildQueryString } from "./api";
import { getRole, getAuthHeaders } from "../utils/authHelpers";
import { downloadBlob } from "../utils/exportHelpers";

const analyticsBaseUrl = () =>
  getRole() === "school_admin" ? `${SEEDS_URL}/school/analytics` : `${SEEDS_URL}/tenant/analytics`;

// Column definitions per exportable section. CSV is built on the client from the
// data already fetched for display — no extra backend round-trip.
const CSV_SECTIONS = {
  ivr: {
    calls: [
      { key: "phoneNumber", header: "Phone Number" },
      { key: "callerName", header: "Caller Name" },
      { key: "callerType", header: "Caller Type" },
      { key: "schoolName", header: "School" },
      { key: "createdAt", header: "Started At" },
      { key: "stoppedAt", header: "Stopped At" },
      { key: "durationSeconds", header: "Duration (s)" },
      { key: "finalStatus", header: "Final Status" },
    ],
    byTeacher: [
      { key: "teacherName", header: "Teacher" },
      { key: "schoolName", header: "School" },
      { key: "totalCalls", header: "Total Calls" },
      { key: "averageSeconds", header: "Avg Session (s)" },
      { key: "failureRate", header: "Failure Rate" },
    ],
    bySchool: [
      { key: "schoolName", header: "School" },
      { key: "totalCalls", header: "Total Calls" },
      { key: "averageSeconds", header: "Avg Session (s)" },
      { key: "medianSeconds", header: "Median Session (s)" },
      { key: "failureRate", header: "Failure Rate" },
    ],
    contentUsage: [
      { key: "title", header: "Content" },
      { key: "playCount", header: "Play Count" },
      { key: "completedPlays", header: "Completed Plays" },
      { key: "uniqueCallers", header: "Unique Callers" },
    ],
  },
  conference: {
    conferences: [
      { key: "conferenceId", header: "Conference ID" },
      { key: "teacherName", header: "Teacher" },
      { key: "schoolName", header: "School" },
      { key: "startedAt", header: "Started At" },
      { key: "endedAt", header: "Ended At" },
      { key: "durationSeconds", header: "Duration (s)" },
      { key: "studentCount", header: "Students" },
      { key: "raisedHandEvents", header: "Raised Hands" },
    ],
    byTeacher: [
      { key: "teacherName", header: "Teacher" },
      { key: "schoolName", header: "School" },
      { key: "totalConferences", header: "Conferences" },
      { key: "totalDurationSeconds", header: "Total Duration (s)" },
      { key: "averageDurationSeconds", header: "Avg Duration (s)" },
      { key: "averageClassSize", header: "Avg Class Size" },
      { key: "raisedHandEvents", header: "Raised Hands" },
    ],
  },
};

const escapeCell = (value) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, "\"\"")}"` : str;
};

const toCsv = (rows, columns) => {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...lines].join("\n");
};

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
   * Export an analytics section as CSV, built client-side from data already
   * fetched for display. No backend round-trip — the data is on the device.
   * @param {"ivr"|"conference"} kind
   * @param {string} section - Section key (e.g. "calls", "byTeacher")
   * @param {Array} rows - The section's rows from the fetched analytics response
   * @param {Date} startDate
   * @param {Date} endDate
   */
  exportAnalyticsCSV(kind, section, rows, startDate, endDate) {
    const columns = CSV_SECTIONS[kind]?.[section];
    if (!columns) {
      throw new Error(`Unknown export section: ${kind}/${section}`);
    }
    const blob = new Blob([toCsv(rows || [], columns)], { type: "text/csv;charset=utf-8;" });
    const datePart = `${startDate.toISOString().slice(0, 10)}-${endDate.toISOString().slice(0, 10)}`;
    downloadBlob(blob, `${kind}-analytics-${section}-${datePart}.csv`);
  },
};
