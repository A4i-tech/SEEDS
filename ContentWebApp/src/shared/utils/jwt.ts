import { z } from 'zod';

export const roleSchema = z.enum(['tenant', 'school_admin', 'content_creator']);
export type Role = z.infer<typeof roleSchema>;

function payload(token: string) {
  return JSON.parse(atob(token.split('.')[1]));
}

export function decodeJwtRole(token: string): Role {
  return roleSchema.parse(payload(token).role);
}

export function decodeJwtSchoolId(token: string): string {
  return payload(token).school_id;
}

export function isJwtExpired(token: string): boolean {
  return payload(token).exp * 1000 <= Date.now();
}
