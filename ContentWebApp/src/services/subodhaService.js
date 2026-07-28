import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

export const subodhaService = {
  /**
   * Fetch all courses previously synced from Subodha.
   * @returns {Promise<Array>}
   */
  async getCourses() {
    const response = await apiFetch(`${SEEDS_URL}/subodha/courses`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    return response.courses || [];
  },

  /**
   * Kick off a sync of every Subodha course.
   * @returns {Promise<{jobId: string}>}
   */
  async syncAll() {
    return apiFetch(`${SEEDS_URL}/subodha/sync`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  /**
   * Kick off a sync scoped to a single Subodha course.
   * @param {string} courseId
   * @returns {Promise<{jobId: string}>}
   */
  async syncCourse(courseId) {
    return apiFetch(`${SEEDS_URL}/subodha/sync/course/${encodeURIComponent(courseId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  /**
   * Poll the status of a sync job.
   * @param {string} jobId
   * @returns {Promise<Object>}
   */
  async getSyncStatus(jobId) {
    return apiFetch(`${SEEDS_URL}/subodha/sync/status/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Fetch a synced course's full content (title, description, blocks) for viewing.
   * @param {string} courseId
   * @returns {Promise<Object>}
   */
  async getCourse(courseId) {
    return apiFetch(`${SEEDS_URL}/subodha/courses/${encodeURIComponent(courseId)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Delete a course's local synced copy (does not touch Subodha itself).
   * @param {string} courseId
   * @returns {Promise<Object>}
   */
  async deleteCourse(courseId) {
    return apiFetch(`${SEEDS_URL}/subodha/courses/${encodeURIComponent(courseId)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Edit a problem block's question/choice text in place. Stored directly on
   * the synced course doc — a future re-sync of this course overwrites it.
   * @param {string} courseId
   * @param {string} blockId
   * @param {{question: string, choices: Array<{value: string, text: string}>}} payload
   * @returns {Promise<Object>}
   */
  async updateProblemBlock(courseId, blockId, payload) {
    return apiFetch(
      `${SEEDS_URL}/subodha/courses/${encodeURIComponent(courseId)}/blocks/${encodeURIComponent(blockId)}`,
      {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * List all currently-running sync jobs (all-scope + per-course) — used to
   * reattach the progress UI after a logout/login or page reload.
   * @returns {Promise<{jobs: Array<Object>}>}
   */
  async getActiveJobs() {
    return apiFetch(`${SEEDS_URL}/subodha/sync/jobs/active`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * List past sync runs for the history panel.
   * @param {{limit?: number, scope?: "all"|"course", courseId?: string}} params
   * @returns {Promise<{jobs: Array<Object>}>}
   */
  async getSyncJobs({ limit = 20, scope, courseId } = {}) {
    const qs = buildQueryString({ limit, scope, courseId });
    return apiFetch(`${SEEDS_URL}/subodha/sync/jobs${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Subscribe to live SSE progress for a job. Uses fetch()+ReadableStream
   * (not native EventSource) so the JWT Authorization header can be sent.
   * Resolves once the stream closes; call onEvent for each parsed event.
   * @param {string} jobId
   * @param {(event: {event: string, job: Object}) => void} onEvent
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<void>}
   */
  async streamJob(jobId, onEvent, { signal } = {}) {
    const response = await fetch(
      `${SEEDS_URL}/subodha/sync/stream/${encodeURIComponent(jobId)}`,
      { headers: getAuthHeaders(), signal }
    );
    if (!response.ok || !response.body) {
      throw new Error(`Failed to open sync stream (status ${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine) {
          onEvent(JSON.parse(dataLine.slice("data: ".length)));
        }
      }
    }
  },
};
