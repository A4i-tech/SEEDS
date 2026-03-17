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
 * Fetch teacher's students list
 *
 * @param {string} phoneNumber - Teacher's phone number
 * @returns {Promise<Array>} List of students
 * @throws {Error} If API call fails
 */
export const getTeacherStudents = async (phoneNumber) => {
  const response = await axiosInstance.post(API_ENDPOINTS.GET_TEACHER_STUDENTS, {
    phoneNumber,
  });
  return response.data;
};
