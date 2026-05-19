import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch } from "./api";

const BASE = `${SEEDS_URL}/subodha`;

export const subodhaService = {
  async listCourses({ page = 1, limit = 50 } = {}) {
    const url = `${BASE}/courses?page=${page}&limit=${limit}`;
    return apiFetch(url, { method: "GET", headers: getAuthHeaders() });
  },

  async getCourse(id) {
    const url = `${BASE}/courses/${encodeURIComponent(id)}`;
    return apiFetch(url, { method: "GET", headers: getAuthHeaders() });
  },

  async patchBlock(courseId, { blockSourceId, expectedBlockVersion, patch }) {
    const url = `${BASE}/courses/${encodeURIComponent(courseId)}/block`;
    return apiFetch(url, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blockSourceId, expectedBlockVersion, patch }),
    });
  },

  async putTranslation(courseId, { blockSourceId, lang, translation, expectedBlockVersion }) {
    const url = `${BASE}/courses/${encodeURIComponent(courseId)}/block/translation`;
    return apiFetch(url, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blockSourceId, lang, translation, expectedBlockVersion }),
    });
  },

  async putAudio(courseId, { blockSourceId, lang, audioUrl }) {
    const url = `${BASE}/courses/${encodeURIComponent(courseId)}/block/audio`;
    return apiFetch(url, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blockSourceId, lang, audioUrl }),
    });
  },

  async getSasToken(blobName) {
    const url = `${BASE}/sasToken?blobName=${encodeURIComponent(blobName)}`;
    return apiFetch(url, { method: "GET", headers: getAuthHeaders() });
  },
};

export const SUBODHA_LANGUAGES = [
  "english",
  "hindi",
  "kannada",
  "tamil",
  "telugu",
  "oriya",
  "bengali",
  "gujarati",
  "malayalam",
  "marathi",
];
