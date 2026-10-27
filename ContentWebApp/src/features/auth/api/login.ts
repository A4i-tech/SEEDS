import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

export async function login(identifier: string, password: string): Promise<string> {
  const { data } = await apiClient.post('/auth/login', { identifier, password });
  return z.object({ token: z.string() }).parse(data).token;
}
