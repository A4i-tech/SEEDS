import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { createSchool, deleteSchool, getSchools, updateSchool } from '../api/schools';
import { registrationKeys, type SchoolUpdate } from '../types/registration.types';
import { useRegistrationRefresh } from './useRegistrationRefresh';

export function useSchools() {
  const { invalidate, saved } = useRegistrationRefresh();
  const status = useAuthStore((s) => s.status);

  const schools = useQuery({
    queryKey: registrationKeys.schools,
    queryFn: getSchools,
    enabled: status === 'authenticated',
  });

  const create = useMutation({ mutationFn: createSchool, onSuccess: saved });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SchoolUpdate }) => updateSchool(id, body),
    onSuccess: saved,
  });
  const remove = useMutation({ mutationFn: deleteSchool, onSuccess: invalidate });

  return {
    schools: schools.data ?? [],
    isLoading: schools.isLoading,
    error: schools.error,
    reload: () => void schools.refetch(),
    create,
    update,
    remove,
  };
}
