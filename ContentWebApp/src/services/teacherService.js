import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import { SchoolTeacherDto, TeacherDto } from "../dto/TeacherDto";
import { StudentDto } from "../dto/StudentDto";

export const teacherService = {
  async getTeachers(headers = {}, signal = null) {
    const response = await apiFetch(`${SEEDS_URL}/school/teachers`, {
      method: "GET",
      headers,
      signal,
    });

    return SchoolTeacherDto.listFromApi(response);
  },

  async registerTeacher(phoneNumber, password, name, role, headers = {}) {
    const response = await apiFetch(`${SEEDS_URL}/teacher/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone_number: phoneNumber,
        password,
        name,
        role,
      }),
    });
    return TeacherDto.fromApi(response);
  },

  async getStudents(headers = {}, signal = null) {
    const response = await apiFetch(`${SEEDS_URL}/student`, {
      method: "GET",
      headers,
      signal,
    });
    return StudentDto.listFromApi(response);
  },

  async createStudent(name, phoneNumber, headers = {}) {
    const response = await apiFetch(`${SEEDS_URL}/student`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, phone_number: phoneNumber }),
    });
    return StudentDto.fromApi(response);
  },

  async updateStudentById(studentId, name, phoneNumber, headers = {}) {
    const response = await apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name, phone_number: phoneNumber }),
    });
    return StudentDto.fromApi(response);
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
      phone_number: (phoneNumber || "").trim(),
    };

    if (password) {
      body.password = password;
    }

    const response = await apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    return TeacherDto.fromApi(response);
  },

  async deleteTeacher(teacherId, headers = {}) {
    return await apiFetch(`${SEEDS_URL}/teacher/${teacherId}`, {
      method: "DELETE",
      headers,
    });
  },

  async transferTeacher(teacherId, targetSchoolId, headers = {}) {
    const response = await apiFetch(`${SEEDS_URL}/school/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({ teacher_id: teacherId, target_school_id: targetSchoolId }),
    });
    return { message: response.message, teacher: TeacherDto.fromApi(response.teacher) };
  },
};
