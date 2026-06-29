import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";
import { parseClassroomResponse, buildClassroomUpsertRequest } from "../dto/school.dto.js";

export const getAllClassrooms = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_ALL);
  return response.data.map(parseClassroomResponse);
};

export const getClassroomById = async (classId) => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_BY_ID(classId));
  return parseClassroomResponse(response.data);
};

export const createClassroom = async (classroomData) => {
  const body = buildClassroomUpsertRequest(classroomData);
  const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.CREATE, body);
  return parseClassroomResponse(response.data);
};

export const updateClassroom = async (classroomData) => {
  try {
    const body = buildClassroomUpsertRequest(classroomData);
    const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.UPDATE, body);
    return parseClassroomResponse(response.data);
  } catch (error) {
    throw new Error("Failed to update classroom");
  }
};

export const deleteClassroom = async (classId) => {
  const response = await axiosInstance.delete(API_ENDPOINTS.CLASSROOM.DELETE(classId));
  return response;
};
