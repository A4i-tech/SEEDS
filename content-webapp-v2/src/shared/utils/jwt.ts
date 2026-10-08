import { z } from 'zod';

const roleSchema = z.object({ role: z.string() });

export function decodeJwtRole(token: string): string {
  if (!token) return '';
  try {
    return roleSchema.parse(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))).role;
  } catch {
    return '';
  }
}

const expSchema = z.object({ exp: z.number().optional() });

export function isJwtExpired(token: string): boolean {
  const { exp } = expSchema.parse(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))));
  return exp !== undefined && exp * 1000 <= Date.now();
}
