import { z } from 'zod';

export const teacherSchema = z.object({
  id: z.string(),
  role: z.string(),
  name: z.string(),
  phone_number: z.string(),
  tenant_id: z.string(),
  school_id: z.string(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

export type Teacher = z.infer<typeof teacherSchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
