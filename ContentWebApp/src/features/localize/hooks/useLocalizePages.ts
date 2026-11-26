import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { listPages } from '../api/review';
import { localizeKeys } from '../types/localize.types';
import { toApiState } from '@shared/utils/apiState';

export function useLocalizePages(siteId: string) {
  const authStatus = useAuthStore((s) => s.status);
  const query = useQuery({
    queryKey: localizeKeys.pages(siteId),
    queryFn: () => listPages(siteId),
    enabled: authStatus === 'authenticated',
  });
  const state = toApiState(query);
  return { state, pages: state.status === 'done' ? state.data : [] };
}
