import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";
import {
  toExtractRequest,
  toTranslationUpdateRequest,
  toTranslationApproveRequest,
  toTranslationRejectRequest,
  toBulkApproveRequest,
} from "./dtos/localizationRequests";
import { fromTranslationResponse } from "./dtos/localizationResponses";

export const translationService = {
  async extractItems(siteId, items) {
    return apiFetch(`${SEEDS_URL}/translations/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExtractRequest({ siteId, items })),
    });
  },

  async getRuntimeTranslations(siteId, route, lang) {
    const queryString = buildQueryString({ site_id: siteId, route, lang });
    return apiFetch(`${SEEDS_URL}/translations?${queryString}`, { method: "GET" });
  },

  async generateForReview({ siteId, route, lang }) {
    const queryString = buildQueryString({ site_id: siteId, route, lang });
    return apiFetch(`${SEEDS_URL}/translations/generate?${queryString}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  },

  async getAuditTrail({ siteId, route, key } = {}) {
    const queryString = buildQueryString({ site_id: siteId, route, key });
    return apiFetch(`${SEEDS_URL}/translations/audit?${queryString}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async listTranslations({ siteId, route, status } = {}) {
    const queryString = buildQueryString({ site_id: siteId, route, status });
    const url = `${SEEDS_URL}/translations/list?${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromTranslationResponse);
  },

  async getTranslation(id) {
    const url = `${SEEDS_URL}/translations/${id}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return fromTranslationResponse(response);
  },

  async getVersions(id) {
    const url = `${SEEDS_URL}/translations/${id}/versions`;

    return apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async updateTranslation(id, lang, text) {
    const url = `${SEEDS_URL}/translations/${id}`;

    const response = await apiFetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toTranslationUpdateRequest({ lang, text })),
    });

    return fromTranslationResponse(response);
  },

  async approveTranslation(id, lang) {
    const url = `${SEEDS_URL}/translations/${id}/approve`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toTranslationApproveRequest({ lang })),
    });

    return fromTranslationResponse(response);
  },

  async rejectTranslation(id, lang, reason = "") {
    const url = `${SEEDS_URL}/translations/${id}/reject`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toTranslationRejectRequest({ lang, reason })),
    });

    return fromTranslationResponse(response);
  },

  async bulkApproveTranslations({ siteId, route, lang }) {
    const url = `${SEEDS_URL}/translations/bulk-approve?${buildQueryString({ site_id: siteId })}`;

    return apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toBulkApproveRequest({ route, lang })),
    });
  },
};
