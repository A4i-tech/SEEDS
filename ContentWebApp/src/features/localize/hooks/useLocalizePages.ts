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
    enabled: authStatus === 'authenticated' && siteId !== '',
    select: (items) => {
      const latest = new Map<string, number>();
      for (const item of items) {
        const route = item.route || '/';
        latest.set(route, Math.max(latest.get(route) ?? 0, Date.parse(item.updated_at) || 0));
      }
      return [...latest.keys()].sort((a, b) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0));
    },
  });
  const state = toApiState(query);
  return { state, pages: state.status === 'done' ? state.data : [] };
}
