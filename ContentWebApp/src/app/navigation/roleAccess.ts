import type { Role } from '@shared/utils/jwt';

const ADMINS: Role[] = ['tenant', 'school_admin'];
const CONTENT_ROLES: Role[] = [...ADMINS, 'content_creator'];

const ROLES_BY_SEGMENT: Record<string, Role[]> = {
  library: CONTENT_ROLES,
  jobs: CONTENT_ROLES,
  'ivr-view': CONTENT_ROLES,
  create: CONTENT_ROLES,
  'make-accessible': CONTENT_ROLES,
  review: CONTENT_ROLES,
  analytics: ADMINS,
  registration: ADMINS,
  localize: ['tenant'],
};

export function canAccess(role: Role, path: string): boolean {
  const allowed = ROLES_BY_SEGMENT[path.split('/')[1]];
  return !allowed || allowed.some((r) => r === role);
}
