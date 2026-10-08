import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getLanguages } from '@shared/services/languages';

export function useLanguages() {
  const status = useAuthStore((s) => s.status);
  const { data: languages = [], error, isLoading } = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
    enabled: status === 'authenticated',
  });
  const options = languages.map((l) => ({ value: l.code, label: l.name }));
  return { languages, options, error, isLoading };
}
