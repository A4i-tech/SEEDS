import { apiClient } from '@shared/services/apiClient';
import { tenantMeSchema, type TenantMe } from '../types/account.types';

export async function getTenantMe(): Promise<TenantMe> {
  const { data } = await apiClient.get('/tenant/me');
  return tenantMeSchema.parse(data);
}

export async function changeTenantPassword(body: { current_password: string; new_password: string }): Promise<void> {
  await apiClient.post('/tenant/change-password', body);
}
