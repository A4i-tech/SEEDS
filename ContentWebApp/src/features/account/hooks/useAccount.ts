import { useMutation, useQuery } from '@tanstack/react-query';
import { useRole } from '@features/auth/store/useAuthStore';
import { changePassword, getMe } from '../api/account';

export function useMe() {
  const role = useRole();
  return useQuery({ queryKey: ['account', 'me', role], queryFn: getMe, retry: false });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
