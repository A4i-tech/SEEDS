import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import {
  deleteTeacher,
  getTeachers,
  registerTeacher,
  transferTeacher,
  updateTeacher,
} from '../api/teachers';
import type { TeacherTransfer, TeacherUpdate } from '../types/registration.types';

export function useTeachers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const enabled = status === 'authenticated' && role !== '' && role !== 'tenant';

  const teachers = useQuery({
    queryKey: ['registration', 'teachers'],
    queryFn: getTeachers,
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['registration'] });
  };

  const saved = () => {
    notifications.show({ message: t('registration.saved') });
    invalidate();
  };

  const register = useMutation({ mutationFn: registerTeacher, onSuccess: saved });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeacherUpdate }) => updateTeacher(id, body),
    onSuccess: saved,
  });
  const remove = useMutation({ mutationFn: deleteTeacher, onSuccess: invalidate });
  const transfer = useMutation({
    mutationFn: (body: TeacherTransfer) => transferTeacher(body),
    onSuccess: (data) => {
      notifications.show({ message: data.message });
      invalidate();
    },
  });

  return {
    teachers: teachers.data ?? [],
    isLoading: teachers.isLoading,
    error: teachers.error,
    reload: () => void teachers.refetch(),
    registerTeacher: register.mutateAsync,
    registering: register.isPending,
    updateTeacher: update.mutateAsync,
    updating: update.isPending,
    deleteTeacher: remove.mutateAsync,
    transferTeacher: transfer.mutateAsync,
    transferring: transfer.isPending,
  };
}
