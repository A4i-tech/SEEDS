import { z } from 'zod';

export const loginResponseSchema = z.object({
  token: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
