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
  try {
    const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.UPDATE, classroomData);
    return response.data;
  } catch (error) {
    if (error.response?.status === 403) {
      throw new Error("Not authorized to update this classroom");
    }
    throw new Error("Failed to update classroom");
  }
};

export const deleteClassroom = async (classId) => {
  const response = await axiosInstance.delete(API_ENDPOINTS.CLASSROOM.DELETE(classId));
  return response;
};
