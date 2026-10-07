import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  schoolTeacherSchema,
  teacherRegisterSchema,
  teacherSchema,
  teacherTransferSchema,
  teacherUpdateSchema,
  type SchoolTeacher,
  type Teacher,
  type TeacherRegister,
  type TeacherTransfer,
  type TeacherUpdate,
} from '../types/registration.types';

const teacherResponseSchema = teacherSchema.extend({ _id: z.string().optional() });

type TeacherResponse = z.infer<typeof teacherResponseSchema>;

function toTeacher(raw: TeacherResponse): Teacher {
  const { _id, ...rest } = raw;
  return { ...rest, id: rest.id ?? _id };
}

const transferResponseSchema = z.object({
  message: z.string(),
  teacher: teacherResponseSchema,
});

export async function getTeachers(): Promise<SchoolTeacher[]> {
  const { data } = await apiClient.get('/school/teachers');
  return z.array(schoolTeacherSchema).parse(data);
}

export async function registerTeacher(body: TeacherRegister): Promise<Teacher> {
  const { data } = await apiClient.post('/teacher/register', teacherRegisterSchema.parse(body));
  return toTeacher(teacherResponseSchema.parse(data));
}

export async function updateTeacher(id: string, body: TeacherUpdate): Promise<Teacher> {
  const { data } = await apiClient.patch(
    `/teacher/${encodeURIComponent(id)}`,
    teacherUpdateSchema.parse(body),
  );
  return toTeacher(teacherResponseSchema.parse(data));
}

export async function deleteTeacher(id: string): Promise<void> {
  await apiClient.delete(`/teacher/${encodeURIComponent(id)}`);
}

export async function transferTeacher(
  body: TeacherTransfer,
): Promise<{ message: string; teacher: Teacher }> {
  const { data } = await apiClient.post('/school/transfer', teacherTransferSchema.parse(body));
  const parsed = transferResponseSchema.parse(data);
  return { message: parsed.message, teacher: toTeacher(parsed.teacher) };
}
