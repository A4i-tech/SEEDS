import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { getAuthHeaders } from "../utils/authHelpers";

export const getAllClassrooms = async () => {
  const response = await fetch(API_ENDPOINTS.CLASSROOM.GET_ALL, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch classrooms");
  }

  return response.json();
};

export const getClassroomById = async (classId) => {
  const response = await fetch(API_ENDPOINTS.CLASSROOM.GET_BY_ID(classId), {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch classroom");
  }

  return response.json();
};

export const createClassroom = async (classroomData) => {
  const response = await fetch(API_ENDPOINTS.CLASSROOM.CREATE, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(classroomData),
  });

  if (!response.ok) {
    throw new Error("Failed to create classroom");
  }

  return response.json();
};

export const updateClassroom = async (classroomData) => {
  const response = await fetch(API_ENDPOINTS.CLASSROOM.UPDATE, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(classroomData),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Not authorized to update this classroom");
    }
    throw new Error("Failed to update classroom");
  }

  return response.json();
};

export const deleteClassroom = async (classId) => {
  const response = await fetch(API_ENDPOINTS.CLASSROOM.DELETE(classId), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to delete classroom");
  }

  return response;
};
