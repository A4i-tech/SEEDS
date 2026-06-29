import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";
import { parseUserPublicResponse } from "../dto/user.dto.js";

/**
 * Fetch current teacher information from /teacher/me
 *
 * @returns {Promise<import('../dto/user.dto.js').UserPublicResponse>} Teacher data: { phone_number, name, email, tenant_id, school_id, ... }
 * @throws {Error} If API call fails
 */
export const getCurrentTeacher = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_TEACHER_ME);
  return parseUserPublicResponse(response.data);
};

/**
 * Fetch all students belonging to the teacher's school from /student
 *
 * @returns {Promise<import('../dto/user.dto.js').UserPublicResponse[]>} List of students: [{ id, name, phone_number, school_id }]
 * @throws {Error} If API call fails
 */
export const getSchoolStudents = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_STUDENTS);
  return response.data.map(parseUserPublicResponse);
};
