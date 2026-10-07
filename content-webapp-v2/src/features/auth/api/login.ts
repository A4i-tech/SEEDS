import { apiClient } from '@shared/services/apiClient';
import { loginResponseSchema } from '../types/auth.types';

export async function login(identifier: string, password: string): Promise<string> {
  const { data } = await apiClient.post('/auth/login', { identifier, password });
  return loginResponseSchema.parse(data).token;
}
