import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { buildQueryString } from "./api";
import { request } from "./requestHelpers";
import {
  toExtractRequest,
  toTranslationUpdateRequest,
  toTranslationApproveRequest,
  toTranslationRejectRequest,
  toBulkApproveRequest,
  fromTranslationResponse,
} from "../dto/LocalizationDto";

const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;

export const translationService = {
  async extractItems(siteId, items) {
    return request(`${SEEDS_URL}/translations/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExtractRequest({ siteId, items })),
    });
  },

  async getRuntimeTranslations(siteId, route, lang) {
    const queryString = buildQueryString({ site_id: siteId, route, lang });
    return request(`${SEEDS_URL}/translations?${queryString}`, { method: "GET" });
  },

  async generateForReview({ siteId, route, lang }) {
    const queryString = buildQueryString({ site_id: siteId, route, lang });
    return request(`${SEEDS_URL}/translations/generate?${queryString}`, {
      timeoutMs: GENERATE_TIMEOUT_MS,
      method: "POST",
      headers: getAuthHeaders(),
    });
  },

  async getAuditTrail({ siteId, route, key } = {}) {
    const queryString = buildQueryString({ site_id: siteId, route, key });
    return request(`${SEEDS_URL}/translations/audit?${queryString}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async listTranslations({ siteId, route, status } = {}) {
    const queryString = buildQueryString({ site_id: siteId, route, status });
    const response = await request(`${SEEDS_URL}/translations/list?${queryString}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    return response.map(fromTranslationResponse);
  },

  async getTranslation(id) {
    const response = await request(`${SEEDS_URL}/translations/${id}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    return fromTranslationResponse(response);
  },

  async getVersions(id) {
    return request(`${SEEDS_URL}/translations/${id}/versions`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async updateTranslation(id, lang, text) {
    const response = await request(`${SEEDS_URL}/translations/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(toTranslationUpdateRequest({ lang, text })),
    });
    return fromTranslationResponse(response);
  },

  async approveTranslation(id, lang) {
    const response = await request(`${SEEDS_URL}/translations/${id}/approve`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toTranslationApproveRequest({ lang })),
    });
    return fromTranslationResponse(response);
  },

  async rejectTranslation(id, lang, reason = "") {
    const response = await request(`${SEEDS_URL}/translations/${id}/reject`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toTranslationRejectRequest({ lang, reason })),
    });
    return fromTranslationResponse(response);
  },

  async bulkApproveTranslations({ siteId, route, lang }) {
    return request(`${SEEDS_URL}/translations/bulk-approve?${buildQueryString({ site_id: siteId })}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(toBulkApproveRequest({ route, lang })),
    });
  },
};
