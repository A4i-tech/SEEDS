import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";

export const teacherService = {
  async getTeachers(headers = {}, signal = null) {
    const response = await apiFetch(`${SEEDS_URL}/school/teachers`, {
      method: "GET",
      headers,
      signal,
    });

    return response.data || response || [];
  },

  async registerTeacher(phoneNumber, password, name, role, headers = {}) {
    return apiFetch(`${SEEDS_URL}/teacher/register`, {
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

    return apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  },

  async deleteTeacher(teacherId, headers = {}) {
    return apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "DELETE",
      headers,
    });
  },

  async transferTeacher(teacherId, targetSchoolId, headers = {}) {
    return apiFetch(`${SEEDS_URL}/school/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({ teacherId, targetSchoolId }),
    });
  },

  async addStudentsToTeacher(phoneNumber, students, headers = {}) {
    return apiFetch(`${SEEDS_URL}/v1/teacher/add-students`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phoneNumber, students }),
    });
  },

  async removeStudentsFromTeacher(phoneNumber, students, headers = {}) {
    return apiFetch(`${SEEDS_URL}/v1/teacher/students`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ phoneNumber, students }),
    });
  },

  async updateTeacherStudent(
    phoneNumber,
    currentPhoneNumber,
    name,
    studentPhoneNumber,
    headers = {}
  ) {
    return apiFetch(`${SEEDS_URL}/v1/teacher/students`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        phoneNumber,
        currentPhoneNumber,
        name,
        studentPhoneNumber,
      }),
    });
  },
};
