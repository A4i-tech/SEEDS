import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";
import {
  parseUserPublicResponse,
  parseTeacherTransferResponse,
  buildStudentCreateRequest,
  buildStudentUpdateRequest,
  buildTeacherUpdateRequest,
  buildTeacherRegisterRequest,
  buildTeacherTransferRequest,
} from "../dto/index.js";

export const teacherService = {
  async getTeachers(headers = {}, signal = null) {
    const raw = await apiFetch(`${SEEDS_URL}/school/teachers`, {
      method: "GET",
      headers,
      signal,
    });

    if (!Array.isArray(raw.data)) throw new Error("getTeachers: expected array");
    return raw.data.map(parseUserPublicResponse);
  },

  async registerTeacher(phone_number, password, name, role, headers = {}) {
    const body = buildTeacherRegisterRequest(phone_number, name, password, role);
    return await apiFetch(`${SEEDS_URL}/teacher/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  },

  async getStudents(headers = {}, signal = null) {
    const raw = await apiFetch(`${SEEDS_URL}/student`, {
      method: "GET",
      headers,
      signal,
    });

    if (!Array.isArray(raw.data)) throw new Error("getStudents: expected array");
    return raw.data.map(parseUserPublicResponse);
  },

  async createStudent(name, phone_number, headers = {}) {
    const body = buildStudentCreateRequest(name, phone_number);
    return apiFetch(`${SEEDS_URL}/student`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  },

  async updateStudentById(studentId, name, phone_number, headers = {}) {
    const body = buildStudentUpdateRequest(name, phone_number);
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  },

  async deleteStudentById(studentId, headers = {}) {
    return apiFetch(`${SEEDS_URL}/student/${studentId}`, {
      method: "DELETE",
      headers,
    });
  },

  async updateTeacher(teacherId, name, phone_number, password, headers = {}) {
    const body = buildTeacherUpdateRequest(name.trim(), phone_number.trim(), password);

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
    const body = buildTeacherTransferRequest(teacherId, targetSchoolId);
    const raw = await apiFetch(`${SEEDS_URL}/school/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return parseTeacherTransferResponse(raw);
  },
};
