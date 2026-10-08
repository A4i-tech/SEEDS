import { useMutation, useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import {
  deleteTeacher,
  getTeachers,
  registerTeacher,
  transferTeacher,
  updateTeacher,
} from '../api/teachers';
import { registrationKeys, type TeacherUpdate } from '../types/registration.types';
import { useRegistrationRefresh } from './useRegistrationRefresh';

export function useTeachers() {
  const { invalidate, saved } = useRegistrationRefresh();
  const status = useAuthStore((s) => s.status);

  const teachers = useQuery({
    queryKey: registrationKeys.teachers,
    queryFn: getTeachers,
    enabled: status === 'authenticated',
  });

  const register = useMutation({ mutationFn: registerTeacher, onSuccess: saved });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeacherUpdate }) => updateTeacher(id, body),
    onSuccess: saved,
  });
  const remove = useMutation({ mutationFn: deleteTeacher, onSuccess: invalidate });
  const transfer = useMutation({
    mutationFn: transferTeacher,
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
    register,
    update,
    remove,
    transfer,
  };
}
