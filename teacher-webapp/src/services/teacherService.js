import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";
import { TeacherDto } from "../dto/TeacherDto";
import { StudentDto } from "../dto/StudentDto";

/**
 * Fetch current teacher information from /teacher/me
 *
 * @returns {Promise<TeacherDto>}
 * @throws {Error} If API call fails
 */
export const getCurrentTeacher = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_TEACHER_ME);
  return TeacherDto.fromApi(response.data);
};

/**
 * Fetch all students belonging to the teacher's school from /student
 *
 * @returns {Promise<StudentDto[]>}
 * @throws {Error} If API call fails
 */
export const getSchoolStudents = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.GET_STUDENTS);
  return StudentDto.listFromApi(response.data);
};
