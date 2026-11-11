import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getSyncJobItems } from '../api/syncJobs';
import { jobKeys } from '../types/job.types';

export function useSyncJobItems(jobId: string, enabled: boolean) {
  const status = useAuthStore((s) => s.status);
  return useInfiniteQuery({
    queryKey: jobKeys.syncItems(jobId),
    queryFn: ({ pageParam }) => getSyncJobItems(jobId, { limit: 50, after: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: status === 'authenticated' && enabled && jobId !== '',
  });
}
