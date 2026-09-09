import { SEEDS_URL } from "../../Constants";
import { getAuthHeaders } from "../../utils/authHelpers";
import { apiFetch, buildQueryString } from "../../services/api";

export async function getAnalyticsSummary(siteId) {
  const qs = buildQueryString({ siteId });
  return apiFetch(`${SEEDS_URL}/translations/analytics/summary${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
}
