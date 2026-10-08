import { useMutation, useQuery } from '@tanstack/react-query';
import { changeTenantPassword, getTenantMe } from '../api/account';

export function useTenantMe() {
  return useQuery({ queryKey: ['account', 'me'], queryFn: getTenantMe, retry: false });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({
      current_password,
      new_password,
    }: {
      current_password: string;
      new_password: string;
    }) => changeTenantPassword(current_password, new_password),
  });
}
