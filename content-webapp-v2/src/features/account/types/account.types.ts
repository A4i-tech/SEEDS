import { z } from 'zod';
import { text } from '@shared/utils/schema';

export const tenantMeSchema = z.object({
  id: text,
  role: z.string(),
  name: z.string(),
  email: z.string(),
  phone_number: text,
  tenant_name: z.string(),
  organisation: text,
});

export type TenantMe = z.infer<typeof tenantMeSchema>;
