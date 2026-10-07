import { z } from 'zod';

const roleSchema = z.object({ role: z.string() });

export function decodeJwtRole(token: string | null): string | null {
  if (!token) return null;
  try {
    return roleSchema.parse(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))).role;
  } catch {
    return null;
  }
}
