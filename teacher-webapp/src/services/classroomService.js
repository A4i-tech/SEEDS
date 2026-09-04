import { API_ENDPOINTS } from "../constants/apiEndpoints";
import axiosInstance from "./axiosInstance";
import { ClassroomDto, ClassroomDetailDto } from "../dto/ClassroomDto";

export const getAllClassrooms = async () => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_ALL);
  return ClassroomDto.listFromApi(response.data);
};

export const getClassroomById = async (classId) => {
  const response = await axiosInstance.get(API_ENDPOINTS.CLASSROOM.GET_BY_ID(classId));
  return ClassroomDetailDto.fromApi(response.data);
};

export const refreshClassroomAfterVoiceCommand = async (classId) => {
  try {
    return await getClassroomById(classId);
  } catch (err) {
    console.error("Error refreshing classroom after voice command:", err);
    return null;
  }
};

const toUpsertPayload = (classroomData) => ({
  id: classroomData.id,
  name: classroomData.name,
  students: classroomData.students.map((s) => s.id),
  leaders: classroomData.leaders.map((l) => l.id),
  content_ids: classroomData.content_ids,
});

export const createClassroom = async (classroomData) => {
  const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.CREATE, toUpsertPayload(classroomData));
  return ClassroomDto.fromApi(response.data);
};

export const updateClassroom = async (classroomData) => {
  const response = await axiosInstance.post(API_ENDPOINTS.CLASSROOM.UPDATE, toUpsertPayload(classroomData));
  return ClassroomDto.fromApi(response.data);
};

export const deleteClassroom = async (classId) => {
  const response = await axiosInstance.delete(API_ENDPOINTS.CLASSROOM.DELETE(classId));
  return response;
};
