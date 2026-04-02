import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { getAuthHeaders } from "../utils/authHelpers";

export const teacherService = {
  async getTeachers(signal = null) {
    return apiFetch(`${SEEDS_URL}/school/teachers`, {
      method: "GET",
      headers: getAuthHeaders(),
      signal,
    });
  },

  async registerTeacher(phoneNumber, password, name) {
    return apiFetch(`${SEEDS_URL}/teacher/register`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ phoneNumber, password, name }),
    });
  },

  async getStudents() {
    return apiFetch(`${SEEDS_URL}/student`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
  },

  async createStudent(name, phoneNumber) {
    return apiFetch(`${SEEDS_URL}/student`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, phoneNumber }),
    });
  },

  async updateStudent(studentId, name, phoneNumber) {
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, phoneNumber }),
    });
  },

  async deleteStudent(studentId) {
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  async updateTeacher(teacherId, name, phoneNumber, password) {
    const body = { name, phoneNumber };
    if (password) body.password = password;
    return apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
  },

  async deleteTeacher(teacherId) {
    return apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  async transferTeacher(teacherId, targetSchoolId) {
    return apiFetch(`${SEEDS_URL}/school/transfer`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ teacherId, targetSchoolId }),
    });
  },
};
