import { z } from 'zod';

export const roleSchema = z.enum(['tenant', 'school_admin', 'content_creator']);
export type Role = z.infer<typeof roleSchema>;

export const adminRoles = ['tenant', 'school_admin'] as const;

export function decodeJwtPayload(token: string) {
  return JSON.parse(atob(token.split('.')[1]));
}

export function decodeJwtRole(token: string): Role {
  return roleSchema.parse(decodeJwtPayload(token).role);
}

export function decodeJwtSchoolId(token: string): string {
  return decodeJwtPayload(token).school_id;
}

export function isJwtExpired(token: string): boolean {
  return decodeJwtPayload(token).exp * 1000 <= Date.now();
}
