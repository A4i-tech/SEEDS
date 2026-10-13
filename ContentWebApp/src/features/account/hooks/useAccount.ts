import { useMutation, useQuery } from '@tanstack/react-query';
import { changeTenantPassword, getTenantMe } from '../api/account';

export function useTenantMe() {
  return useQuery({ queryKey: ['account', 'me'], queryFn: getTenantMe, retry: false });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changeTenantPassword });
}
