import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { createStudent, deleteStudent, getStudents, updateStudent } from '../api/students';
import type { StudentUpdate } from '../types/registration.types';

export function useStudents() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const enabled = status === 'authenticated' && role !== null && role !== 'tenant';

  const students = useQuery({
    queryKey: ['registration', 'students'],
    queryFn: getStudents,
    enabled,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['registration'] });
  };

  const saved = () => {
    notifications.show({ message: t('registration.saved') });
    invalidate();
  };

  const create = useMutation({ mutationFn: createStudent, onSuccess: saved });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StudentUpdate }) => updateStudent(id, body),
    onSuccess: saved,
  });
  const remove = useMutation({ mutationFn: deleteStudent, onSuccess: invalidate });

  return {
    students: students.data ?? [],
    isLoading: students.isLoading,
    error: students.error,
    reload: () => void students.refetch(),
    createStudent: create.mutateAsync,
    creating: create.isPending,
    updateStudent: update.mutateAsync,
    updating: update.isPending,
    deleteStudent: remove.mutateAsync,
  };
}
