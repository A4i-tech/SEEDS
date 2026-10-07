import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { createSchool, deleteSchool, getSchools, updateSchool } from '../api/schools';
import type { SchoolUpdate } from '../types/registration.types';

export function useSchools() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const enabled = status === 'authenticated' && role === 'tenant';

  const schools = useQuery({
    queryKey: ['registration', 'schools'],
    queryFn: getSchools,
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['registration'] });
  };

  const saved = () => {
    notifications.show({ message: t('registration.saved') });
    invalidate();
  };

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
    createSchool: create.mutateAsync,
    creating: create.isPending,
    updateSchool: update.mutateAsync,
    updating: update.isPending,
    deleteSchool: remove.mutateAsync,
  };
}
