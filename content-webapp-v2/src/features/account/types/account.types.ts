import { z } from 'zod';
import { text } from '@shared/utils/schema';

export const tenantMeSchema = z.object({
  id: text,
  role: z.string(),
  name: z.string(),
  email: text,
  phone_number: text,
  tenant_name: text,
  organisation: text,
});

export type TenantMe = z.infer<typeof tenantMeSchema>;
