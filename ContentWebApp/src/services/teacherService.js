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
    const url = `${SEEDS_URL}/v1/teacher/teachers`;

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
   * @param {Object} headers - Auth headers
   * @returns {Promise<Object>}
   */
  async registerTeacher(phoneNumber, password, name, headers = {}) {
    const url = `${SEEDS_URL}/teacher/register`;

    return await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phoneNumber,
        password,
        name,
      }),
    });
  },

  /**
   * Add students to a teacher
   * @param {string} teacherPhoneNumber - Teacher's phone number
   * @param {Array} students - Array of {name, phoneNumber}
   * @param {Object} headers - Auth headers
   * @returns {Promise<Array>}
   */
  async addStudents(teacherPhoneNumber, students, headers = {}) {
    const url = `${SEEDS_URL}/v1/teacher/add-students`;

    return await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phoneNumber: teacherPhoneNumber,
        students,
      }),
    });
  },

  /**
   * Remove student from teacher
   * @param {string} teacherPhoneNumber - Teacher's phone number
   * @param {string} studentPhoneNumber - Student's phone number
   * @param {Object} headers - Auth headers
   * @returns {Promise<void>}
   */
  async removeStudent(teacherPhoneNumber, studentPhoneNumber, headers = {}) {
    const url = `${SEEDS_URL}/v1/teacher/students`;

    await apiFetch(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        phoneNumber: teacherPhoneNumber,
        students: [{ phoneNumber: studentPhoneNumber }],
        remove: true,
      }),
    });
  },
};
