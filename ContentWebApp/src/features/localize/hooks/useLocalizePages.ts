import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { listTranslations } from '../api/review';
import { localizeKeys } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';

export function useLocalizePages(siteId: string) {
  const authStatus = useAuthStore((s) => s.status);
  const query = useQuery({
    queryKey: localizeKeys.pages(siteId),
    queryFn: () => listTranslations(siteId),
    enabled: authStatus === 'authenticated',
    select: (items) => [...new Set(items.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)).map((item) => item.route))],
  });
  const state = toApiState(query);
  return { state, pages: state.status === 'done' ? state.data : [] };
}
