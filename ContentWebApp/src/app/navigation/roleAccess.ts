import { adminRoles, roleSchema, volunteerRole, type Role } from '@shared/utils/jwt';

const CONTENT_ROLES = roleSchema.options.filter((role) => role !== volunteerRole);
const WITH_VOLUNTEER: readonly Role[] = [...CONTENT_ROLES, volunteerRole];

const ROLES_BY_SEGMENT: Record<string, readonly Role[]> = {
  library: CONTENT_ROLES,
  jobs: WITH_VOLUNTEER,
  'ivr-view': CONTENT_ROLES,
  create: CONTENT_ROLES,
  'make-accessible': WITH_VOLUNTEER,
  review: WITH_VOLUNTEER,
  analytics: adminRoles,
  registration: adminRoles,
  localize: ['tenant'],
};

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROLES_BY_SEGMENT[path.split('/')[1]];
  if (!allowed) return role !== volunteerRole;
  return allowed.includes(role);
}
