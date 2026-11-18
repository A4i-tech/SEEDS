import { z } from 'zod';

export const adminRoles = ['tenant', 'school_admin'] as const;
export const volunteerRole = 'textbook_remediation_volunteer';
export const roleSchema = z.enum([...adminRoles, 'content_creator', volunteerRole]);
export type Role = z.infer<typeof roleSchema>;

const claimsSchema = z.object({ role: z.string(), school_id: z.string().default('') });

export function decodeJwtPayload(token: string) {
  return claimsSchema.parse(JSON.parse(atob(token.split('.')[1])));
}

export function decodeJwtRole(token: string): Role {
  return roleSchema.parse(decodeJwtPayload(token).role);
}

export function decodeJwtSchoolId(token: string): string {
  return decodeJwtPayload(token).school_id;
}
