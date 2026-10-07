import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  studentCreateSchema,
  studentSchema,
  studentUpdateSchema,
  type Student,
  type StudentCreate,
  type StudentUpdate,
} from '../types/registration.types';

export async function getStudents(): Promise<Student[]> {
  const { data } = await apiClient.get('/student');
  return z.array(studentSchema).parse(data);
}

export async function createStudent(body: StudentCreate): Promise<Student> {
  const { data } = await apiClient.post('/student', studentCreateSchema.parse(body));
  return studentSchema.parse(data);
}

export async function updateStudent(id: string, body: StudentUpdate): Promise<Student> {
  const { data } = await apiClient.patch(
    `/student/${encodeURIComponent(id)}`,
    studentUpdateSchema.parse(body),
  );
  return studentSchema.parse(data);
}

export async function deleteStudent(id: string): Promise<void> {
  await apiClient.delete(`/student/${encodeURIComponent(id)}`);
}
