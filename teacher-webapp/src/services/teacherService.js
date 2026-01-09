import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAuthHeaders } from "../utils/authHelpers";

/**
 * Fetch current teacher information from /teacher/me
 *
 * @returns {Promise<Object>} Teacher data: { phoneNumber, name, email, tenantId, ... }
 * @throws {Error} If API call fails
 */
export const getCurrentTeacher = async () => {
  const response = await fetch(API_ENDPOINTS.GET_TEACHER_ME, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch teacher information");
  }

  return response.json();
};

/**
 * Fetch teacher's students list
 *
 * @param {string} phoneNumber - Teacher's phone number
 * @returns {Promise<Array>} List of students
 * @throws {Error} If API call fails
 */
export const getTeacherStudents = async (phoneNumber) => {
  const token = localStorage.getItem("authToken");

  const response = await fetch(API_ENDPOINTS.GET_TEACHER_STUDENTS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ phoneNumber }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch teacher students");
  }

  return response.json();
};
