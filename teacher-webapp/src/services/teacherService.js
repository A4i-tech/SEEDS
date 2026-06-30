import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";

/**
 * Fetch current teacher information from /teacher/me
 *
 * @returns {Promise<Object>} Teacher data: { phoneNumber, name, email, tenantId, ... }
 * @throws {Error} If API call fails
 */
export const getCurrentTeacher = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_TEACHER_ME);
  return response.data;
};

/**
 * Fetch all students belonging to the teacher's school from /student
 *
 * @returns {Promise<Array>} List of students: [{ _id, name, phoneNumber, schoolId }]
 * @throws {Error} If API call fails
 */
export const getSchoolStudents = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_STUDENTS);
  return response.data.map((s) => (s.id ? s : { ...s, id: s._id }));
};
