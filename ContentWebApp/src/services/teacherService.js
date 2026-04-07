import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";

export const teacherService = {
  /**
   * Fetch all teachers for a tenant
   * @param {Object} headers - Auth headers
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @returns {Promise<Array>}
   */
  async getTeachers(headers = {}, signal = null) {
    const url = `${SEEDS_URL}/school/teachers`;

    const response = await apiFetch(url, {
      method: "GET",
      headers,
      signal,
    });

    return response.data || response || [];
  },

  /**
   * Register a new teacher
   * @param {string} phoneNumber - Teacher phone number
   * @param {string} password - Teacher password
   * @param {string} name - Teacher name
   * @param {Object} headers - Auth headers
   * @returns {Promise<Object>}
   */
  async registerTeacher(phoneNumber, password, name, role, headers = {}) {
    const url = `${SEEDS_URL}/teacher/register`;

    return await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phoneNumber,
        password,
        name,
        role,
      }),
    });
  },

  async getStudents(headers = {}, signal = null) {
    return apiFetch(`${SEEDS_URL}/student`, {
      method: "GET",
      headers,
      signal,
    });
  },

  async createStudent(name, phoneNumber, headers = {}) {
    return apiFetch(`${SEEDS_URL}/student`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, phoneNumber }),
    });
  },

  async updateStudentById(studentId, name, phoneNumber, headers = {}) {
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name, phoneNumber }),
    });
  },

  async deleteStudentById(studentId, headers = {}) {
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "DELETE",
      headers,
    });
  },

  async updateTeacher(teacherId, name, phoneNumber, password, headers = {}) {
    const body = {
      name: (name || "").trim(),
      phoneNumber: (phoneNumber || "").trim(),
    };

    if (password) {
      body.password = password;
    }

    return await apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  },

  async deleteTeacher(teacherId, headers = {}) {
    return await apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "DELETE",
      headers,
    });
  },

  async transferTeacher(teacherId, targetSchoolId, headers = {}) {
    return await apiFetch(`${SEEDS_URL}/school/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({ teacherId, targetSchoolId }),
    });
  },
};
