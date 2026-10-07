import { z } from 'zod';

export const tenantMeSchema = z.object({
  id: z.string().nullable().optional(),
  role: z.string(),
  name: z.string(),
  email: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  tenant_name: z.string().nullable().optional(),
  organisation: z.string().nullable().optional(),
});

export type TenantMe = z.infer<typeof tenantMeSchema>;

export function sessionRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const segment = token.split('.')[1] ?? '';
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: unknown;
    };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
