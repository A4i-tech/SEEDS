import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

export const translationService = {
  async extractItems(siteId, items) {
    return apiFetch(`${SEEDS_URL}/translations/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, items }),
    });
  },

  async getRuntimeTranslations(siteId, route, lang) {
    const queryString = buildQueryString({ siteId, route, lang });
    return apiFetch(`${SEEDS_URL}/translations?${queryString}`, { method: "GET" });
  },

  async generateForReview({ siteId, route, lang }) {
    const queryString = buildQueryString({ siteId, route, lang });
    return apiFetch(`${SEEDS_URL}/translations/generate?${queryString}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  },

  async getAuditTrail({ siteId, route, key } = {}) {
    const queryString = buildQueryString({ siteId, route, key });
    return apiFetch(`${SEEDS_URL}/translations/audit?${queryString}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async listTranslations({ siteId, route, status } = {}) {
    const queryString = buildQueryString({ siteId, route, status });
    const url = `${SEEDS_URL}/translations/list?${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return (response || []).map((item) => {
      if (!item.id && item._id) {
        return { ...item, id: item._id };
      }
      return item;
    });
  },

  async getTranslation(id) {
    const url = `${SEEDS_URL}/translations/${id}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
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
      body: JSON.stringify({ lang, text }),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },

  async approveTranslation(id, lang) {
    const url = `${SEEDS_URL}/translations/${id}/approve`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lang }),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },

  async rejectTranslation(id, lang, reason = "") {
    const url = `${SEEDS_URL}/translations/${id}/reject`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lang, reason }),
    });

    if (response && !response.id && response._id) {
      return { ...response, id: response._id };
    }
    return response;
  },

  async bulkApproveTranslations({ siteId, route, lang }) {
    const url = `${SEEDS_URL}/translations/bulk-approve?${buildQueryString({ siteId })}`;

    return apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ route, lang }),
    });
  },
};
