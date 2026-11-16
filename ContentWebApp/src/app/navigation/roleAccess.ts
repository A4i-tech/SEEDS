import { adminRoles, roleSchema, type Role } from '@shared/utils/jwt';

const CONTENT_ROLES = roleSchema.options;

const ROLES_BY_SEGMENT: Record<string, readonly Role[]> = {
  library: CONTENT_ROLES,
  jobs: CONTENT_ROLES,
  'ivr-view': CONTENT_ROLES,
  create: CONTENT_ROLES,
  'make-accessible': CONTENT_ROLES,
  review: CONTENT_ROLES,
  analytics: adminRoles,
  registration: adminRoles,
  localize: ['tenant'],
};

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROLES_BY_SEGMENT[path.split('/')[1]];
  return !allowed || allowed.includes(role);
}
