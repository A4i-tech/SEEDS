import { adminRoles, roleSchema, volunteerRole, type Role } from '@shared/utils/jwt';

const CONTENT_ROLES = roleSchema.options.filter((role) => role !== volunteerRole);
const VOLUNTEER_SEGMENTS = ['jobs', 'make-accessible', 'review'];

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
  const segment = path.split('/')[1];
  if (role === volunteerRole) return VOLUNTEER_SEGMENTS.includes(segment);
  const allowed = ROLES_BY_SEGMENT[segment];
  return !allowed || allowed.includes(role);
}
