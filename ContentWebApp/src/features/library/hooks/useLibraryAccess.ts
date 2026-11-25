import { useRole, useSchoolId } from '@features/auth/store/useAuthStore';

export function useLibraryAccess() {
  const role = useRole();
  const schoolId = useSchoolId();
  const isTenant = role === 'tenant';
  return {
    canDeleteCourse: isTenant,
    canModifyContent: (ownerSchoolId: string) => isTenant || ownerSchoolId === schoolId,
  };
}
