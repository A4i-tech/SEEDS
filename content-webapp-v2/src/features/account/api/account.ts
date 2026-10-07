import { apiClient } from '@shared/services/apiClient';
import { tenantMeSchema } from '../types/account.types';
import type { TenantMe } from '../types/account.types';

export async function getTenantMe(): Promise<TenantMe> {
  const { data } = await apiClient.get('/tenant/me');
  return tenantMeSchema.parse(data);
}

export async function changeTenantPassword(
  current_password: string,
  new_password: string,
): Promise<void> {
  await apiClient.post('/tenant/change-password', { current_password, new_password });
}
