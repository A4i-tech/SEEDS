// analytics.dto.js — request and response shapes for analytics endpoints

// ---------------------------------------------------------------------------
// Response typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AnalyticsResponse
 * @property {string} start_date
 * @property {string} end_date
 * @property {number} count
 * @property {Object[]} data
 */

// ---------------------------------------------------------------------------
// Parse factories
// ---------------------------------------------------------------------------

/**
 * @param {unknown} raw
 * @returns {AnalyticsResponse}
 */
export function parseAnalyticsResponse(raw) {
  if (!raw) throw new Error("AnalyticsResponse: empty response");
  return {
    start_date: raw.start_date,
    end_date: raw.end_date,
    count: raw.count,
    data: raw.data,
  };
}
