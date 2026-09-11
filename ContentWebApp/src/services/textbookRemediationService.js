import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString, streamSse } from "./api";

const BASE = `${SEEDS_URL}/textbook-remediation`;

export const textbookRemediationService = {
  async createJob(file, language) {
    const body = new FormData();
    body.append("file", file);
    body.append("language", language);
    const { "Content-Type": _unused, ...headers } = getAuthHeaders();
    return apiFetch(`${BASE}/jobs`, { method: "POST", headers, body });
  },

  async getJobs(limit = 20) {
    return apiFetch(`${BASE}/jobs?${buildQueryString({ limit })}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async getJob(jobId) {
    return apiFetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async streamJob(jobId, onEvent, { signal } = {}) {
    return streamSse(`${BASE}/jobs/${encodeURIComponent(jobId)}/stream`, onEvent, {
      headers: getAuthHeaders(),
      signal,
    });
  },

  async getArtifactText(jobId, name) {
    const response = await fetch(
      `${BASE}/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`,
      { headers: getAuthHeaders() }
    );
    if (!response.ok) {
      throw new Error(`Could not read ${name} (status ${response.status})`);
    }
    return response.text();
  },

  async downloadArtifact(jobId, name, filename) {
    const response = await fetch(
      `${BASE}/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`,
      { headers: getAuthHeaders() }
    );
    if (!response.ok) {
      throw new Error(`Could not download ${name} (status ${response.status})`);
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  async getFindings(jobId, { name = "findings", limit = 50, offset = 0 } = {}) {
    const query = buildQueryString({ name, limit, offset });
    return apiFetch(`${BASE}/jobs/${encodeURIComponent(jobId)}/findings?${query}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async saveDraft(jobId, draftMd, figureOverrides = null) {
    return apiFetch(`${BASE}/jobs/${encodeURIComponent(jobId)}/draft`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ draft_md: draftMd, figure_overrides: figureOverrides }),
    });
  },

  async markVerified(jobId, { title, subject, grade, publishToLibrary = true } = {}) {
    return apiFetch(`${BASE}/jobs/${encodeURIComponent(jobId)}/verify`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title,
        subject,
        grade,
        publish_to_library: publishToLibrary,
      }),
    });
  },

  async getReviewSummary(jobId) {
    return apiFetch(`${BASE}/jobs/${encodeURIComponent(jobId)}/review-summary`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },
};
