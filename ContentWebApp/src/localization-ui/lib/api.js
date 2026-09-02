import { SEEDS_URL } from "../../Constants";
import { getAuthHeaders } from "../../utils/authHelpers";
import { apiFetch, buildQueryString } from "../../services/api";

/**
 * Thin reads over EXISTING endpoints for the redesigned dashboard.
 * No new backend — just consuming routes the platform already exposes.
 */
export async function getAnalyticsSummary(siteId) {
  const qs = buildQueryString({ siteId });
  return apiFetch(`${SEEDS_URL}/translations/analytics/summary${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
}
