import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";

export const getAllClassrooms = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_ALL);
  return response.data;
};

export const getClassroomById = async (classId) => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_BY_ID(classId));
  return response.data;
};

export const createClassroom = async (classroomData) => {
  const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.CREATE, classroomData);
  return response.data;
};

export const updateClassroom = async (classroomData) => {
  const payload = {
    ...classroomData,
    students: classroomData.students.map((s) => (typeof s === "object" ? s.id : s)),
    leaders: classroomData.leaders.map((l) => (typeof l === "object" ? l.id : l)),
  };
  const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.UPDATE, payload);
  return response.data;
};

export const deleteClassroom = async (classId) => {
  const response = await axiosInstance.delete(API_ENDPOINTS.CLASSROOM.DELETE(classId));
  return response;
};
