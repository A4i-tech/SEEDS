import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

const tenantRegisterSchema = z.object({
  email: z.string(),
  password: z.string(),
  tenant_name: z.string(),
});

type TenantRegister = z.infer<typeof tenantRegisterSchema>;

export async function registerTenant(payload: TenantRegister): Promise<void> {
  await apiClient.post('/tenant/register', tenantRegisterSchema.parse(payload));
}
