import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/useAuthStore';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      login(identifier, password),
  });
}
