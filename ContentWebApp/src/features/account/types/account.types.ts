import { z } from 'zod';
import { text } from '@shared/utils/schema';

export const meSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone_number: text,
  tenant_name: text,
  organisation: text,
});

export type Me = z.infer<typeof meSchema>;
