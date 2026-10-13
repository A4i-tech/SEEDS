import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSyncJobItems } from '../api/syncJobs';
import { jobKeys } from '../types/job.types';

export function useSyncJobItems(jobId: string, enabled: boolean) {
  const status = useAuthStore((s) => s.status);
  return useInfiniteQuery({
    queryKey: jobKeys.syncItems(jobId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      getSyncJobItems(jobId, { limit: 50, after: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    enabled: status === 'authenticated' && enabled && jobId !== '',
  });
}
