import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch } from "./api";

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
};
