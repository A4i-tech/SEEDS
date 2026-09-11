import { apiClient } from '@shared/services/apiClient';
import { classMemberSchema, classroomDetailSchema, classroomSchema } from '../types/classroom.types';
import type { ClassroomUpsert } from '../types/classroom.types';

export async function getAllClassrooms() {
  const { data } = await apiClient.get('/class');
  return classroomSchema.array().parse(data);
}

export async function getClassroomById(classroomId: string) {
  const { data } = await apiClient.get(`/class/${classroomId}`);
  return classroomDetailSchema.parse(data);
}

function toUpsertPayload(classroom: ClassroomUpsert) {
  return {
    id: classroom.id,
    name: classroom.name,
    students: classroom.students,
    leaders: classroom.leaders,
    content_ids: classroom.content_ids,
  };
}

export async function createClassroom(classroom: ClassroomUpsert) {
  const { data } = await apiClient.post('/class', toUpsertPayload(classroom));
  return classroomSchema.parse(data);
}

export async function updateClassroom(classroom: ClassroomUpsert) {
  const { data } = await apiClient.post('/class', toUpsertPayload(classroom));
  return classroomSchema.parse(data);
}

export async function deleteClassroom(classroomId: string) {
  await apiClient.delete(`/class/${classroomId}`);
}

export async function getSchoolStudents() {
  const { data } = await apiClient.get('/student');
  return classMemberSchema.array().parse(data);
}
