import { apiClient } from '@shared/services/apiClient';
import { loginResponseSchema, teacherSchema } from '../types/auth.types';

export async function login(phoneNumber: string, password: string): Promise<string> {
  const { data } = await apiClient.post('/teacher/login', {
    phone_number: phoneNumber,
    password,
  });

  return loginResponseSchema.parse(data).token;
}

export async function getCurrentTeacher() {
  const { data } = await apiClient.get('/teacher/me');

  return teacherSchema.parse(data);
}
