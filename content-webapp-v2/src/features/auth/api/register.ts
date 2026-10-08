import { apiClient } from '@shared/services/apiClient';

export async function registerTenant(payload: {
  email: string;
  password: string;
  tenant_name: string;
}): Promise<void> {
  await apiClient.post('/tenant/register', payload);
}
