import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch } from "./api";

// Imported-content endpoints live under /content. Editor consumes the full
// ContentV3 doc via GET /content/:id; the v3 tree is at doc.imported.tree,
// per-block bodies at doc.imported.blocks[<seedsBlockId>].
const BASE = `${SEEDS_URL}/content`;

export const subodhaService = {
  async getCourse(id) {
    const url = `${BASE}/${encodeURIComponent(id)}`;
    return apiFetch(url, { method: "GET", headers: getAuthHeaders() });
  },

  async getVendors() {
    const url = `${BASE}/vendors`;
    return apiFetch(url, { method: "GET", headers: getAuthHeaders() });
  },

  async patchBlock(courseId, { seedsBlockId, expectedBlockVersion, patch }) {
    const url = `${BASE}/${encodeURIComponent(courseId)}/imported-block`;
    return apiFetch(url, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ seedsBlockId, expectedBlockVersion, patch }),
    });
  },

  async putTranslation(courseId, { seedsBlockId, lang, translation, expectedBlockVersion }) {
    const url = `${BASE}/${encodeURIComponent(courseId)}/imported-block/translation`;
    return apiFetch(url, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ seedsBlockId, lang, translation, expectedBlockVersion }),
    });
  },

  async putAudio(courseId, { seedsBlockId, lang, audioUrl }) {
    const url = `${BASE}/${encodeURIComponent(courseId)}/imported-block/audio`;
    return apiFetch(url, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ seedsBlockId, lang, audioUrl }),
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
