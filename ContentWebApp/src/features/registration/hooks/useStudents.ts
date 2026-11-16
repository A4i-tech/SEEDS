import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiState } from '@shared/utils/apiState';
import { createStudent, deleteStudent, getStudents, updateStudent } from '../api/students';
import { registrationKeys, type StudentUpdate } from '../types/registration.types';
import { useRegistrationRefresh } from './useRegistrationRefresh';

export function useStudents() {
  const { invalidate, saved } = useRegistrationRefresh();
  const status = useAuthStore((s) => s.status);

  const students = useQuery({
    queryKey: registrationKeys.students,
    queryFn: getStudents,
    enabled: status === 'authenticated',
  });

  const create = useMutation({ mutationFn: createStudent, onSuccess: saved });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StudentUpdate }) => updateStudent(id, body),
    onSuccess: saved,
  });
  const remove = useMutation({ mutationFn: deleteStudent, onSuccess: invalidate });

  const state = toApiState(students);

  return {
    state,
    students: state.status === 'done' ? state.data : [],
    reload: () => void students.refetch(),
    create,
    update,
    remove,
  };
}
