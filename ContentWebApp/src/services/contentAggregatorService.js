import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

const base = (source) => `${SEEDS_URL}/content-aggregators/${source}`;
const root = `${SEEDS_URL}/content-aggregators`;

export const contentAggregatorService = {
  /**
   * Fetch all courses previously synced from the source.
   * @param {string} source
   * @returns {Promise<Array>}
   */
  async getCourses(source, cursor = null, limit = 20) {
    const query = buildQueryString({ cursor, limit });
    return apiFetch(`${base(source)}/courses?${query}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Kick off a combined sync across ALL sources (parallel), new-only, via the
   * backend's per-source diff. One job tracks the whole run.
   * @returns {Promise<{job_id: string}>}
   */
  async syncAll() {
    return apiFetch(`${root}/sync`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ onlyNew: true }),
    });
  },

  /**
   * Kick off a sync scoped to a single course.
   * @param {string} courseId
   * @param {string} source
   * @returns {Promise<{job_id: string}>}
   */
  async syncCourse(courseId, source) {
    return apiFetch(`${base(source)}/sync/course/${encodeURIComponent(courseId)}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  /**
   * Poll the status of a sync job.
   * @param {string} jobId
   * @param {string} source
   * @returns {Promise<Object>}
   */
  async getSyncStatus(jobId) {
    return apiFetch(`${root}/sync/status/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Fetch a synced course's full content (title, description, blocks) for viewing.
   * @param {string} courseId
   * @param {string} source
   * @returns {Promise<Object>}
   */
  async getCourse(courseId, source) {
    return apiFetch(`${base(source)}/courses/${encodeURIComponent(courseId)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Delete a course's local synced copy (does not touch the source itself).
   * @param {string} courseId
   * @param {string} source
   * @returns {Promise<Object>}
   */
  async deleteCourse(courseId, source) {
    return apiFetch(`${base(source)}/courses/${encodeURIComponent(courseId)}`, {
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
   * @param {string} source
   * @returns {Promise<Object>}
   */
  async updateProblemBlock(courseId, blockId, payload, source) {
    return apiFetch(
      `${base(source)}/courses/${encodeURIComponent(courseId)}/blocks/${encodeURIComponent(blockId)}`,
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
   * @param {string} source
   * @returns {Promise<{jobs: Array<Object>}>}
   */
  async getActiveJobs() {
    return apiFetch(`${root}/sync/jobs/active`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * List past sync runs for the history panel.
   * @param {{limit?: number, scope?: "all"|"course", courseId?: string, source?: string}} params
   * @returns {Promise<{jobs: Array<Object>}>}
   */
  async getSyncJobs({ limit = 20, scope } = {}) {
    const qs = buildQueryString({ limit, scope });
    return apiFetch(`${root}/sync/jobs${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Fetch a page of per-item sync results for a job (cursor-paginated).
   * @param {string} jobId
   * @param {{limit?: number, after?: string}} [params]
   * @returns {Promise<{items: Array<Object>, next_cursor: string|null, total: number}>}
   */
  async getSyncJobItems(jobId, { limit = 20, after } = {}) {
    const qs = buildQueryString({ limit, after });
    return apiFetch(`${root}/sync/status/${encodeURIComponent(jobId)}/items${qs ? `?${qs}` : ""}`, {
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
   * @param {{signal?: AbortSignal, source?: string}} [options]
   * @returns {Promise<void>}
   */
  async streamJob(jobId, onEvent, { signal } = {}) {
    const response = await fetch(
      `${root}/sync/stream/${encodeURIComponent(jobId)}`,
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
