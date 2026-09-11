import { useQuery } from '@tanstack/react-query';
import { getCurrentTeacher } from '../api/login';
import { useAuthStore } from '../store/authStore';

export function useTeacher() {
  const status = useAuthStore((state) => state.status);
  return useQuery({
    queryKey: ['teacher', 'me'],
    queryFn: getCurrentTeacher,
    enabled: status === 'authenticated',
  });
}
