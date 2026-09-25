import { getSessionHistory } from '@shared/services/sessionHistory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClassroom,
  deleteClassroom,
  getAllClassrooms,
  getClassroomById,
  getSchoolStudents,
  updateClassroom,
} from '../api/classrooms';

export function useSessionHistory() {
  return useQuery({ queryKey: ['sessionHistory'], queryFn: getSessionHistory });
}

const classroomsKey = ['classrooms'];
const classroomKey = (id: string) => ['classrooms', id];

export function useClassrooms() {
  return useQuery({ queryKey: classroomsKey, queryFn: getAllClassrooms });
}

export function useClassroom(classroomId: string) {
  return useQuery({
    queryKey: classroomKey(classroomId),
    queryFn: () => getClassroomById(classroomId),
    enabled: !!classroomId,
  });
}

export function useSchoolStudents() {
  return useQuery({ queryKey: ['students'], queryFn: getSchoolStudents });
}

export function useCreateClassroom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createClassroom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classroomsKey }),
  });
}

export function useUpdateClassroom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateClassroom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classroomsKey }),
  });
}

export function useDeleteClassroom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteClassroom,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classroomsKey }),
  });
}
