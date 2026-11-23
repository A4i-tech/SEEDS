import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

export async function login(identifier: string, password: string): Promise<string> {
  const { data } = await apiClient.post('/auth/login', { identifier, password }, { credentials: 'include' });
  return z.object({ token: z.string() }).parse(data).token;
}

export async function refresh(): Promise<string> {
  const { data } = await apiClient.post('/auth/token/refresh', undefined, { credentials: 'include' });
  return z.object({ access_token: z.string() }).parse(data).access_token;
}

export async function logout() {
  await apiClient.post('/tenant/logout', undefined, { credentials: 'include' });
}
