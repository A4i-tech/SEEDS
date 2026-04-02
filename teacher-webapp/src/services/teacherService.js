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
 * Fetch all students belonging to the teacher's school from /student
 *
 * @returns {Promise<Array>} List of students: [{ _id, name, phoneNumber, schoolId }]
 * @throws {Error} If API call fails
 */
export const getSchoolStudents = async () => {
  const response = await fetch(API_ENDPOINTS.GET_STUDENTS, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch school students");
  }

  return response.json();
};

// TODO: teacher-student direct relation removed — student management moves to school layer
// export const getTeacherStudents = async (phoneNumber) => {
//   const token = localStorage.getItem("authToken");
//   const response = await fetch(API_ENDPOINTS.GET_TEACHER_STUDENTS, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       ...(token ? { Authorization: `Bearer ${token}` } : {}),
//     },
//     body: JSON.stringify({ phoneNumber }),
//   });
//   if (!response.ok) {
//     throw new Error("Failed to fetch teacher students");
//   }
//   return response.json();
// };
