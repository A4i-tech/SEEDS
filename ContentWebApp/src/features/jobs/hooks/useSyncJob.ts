import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { apiUrl, authHeaders } from '@shared/services/apiClient';
import { streamJob } from '@shared/services/sse';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { getSyncStatus, syncJobStreamUrl } from '../api/syncJobs';
import { jobKeys, syncJobSchema } from '../types/job.types';

export const terminalStatuses = new Set(['completed', 'failed']);

export function useSyncJob(jobId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const queryKey = useMemo(() => jobKeys.syncDetail(jobId), [jobId]);

  const job = useQuery({
    queryKey,
    queryFn: () => getSyncStatus(jobId),
    enabled: status === 'authenticated' && enabled && jobId !== '',
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || terminalStatuses.has(data.status)) return false;
      return data.total_courses === 0 ? 1000 : 5000;
    },
  });

  useEffect(() => {
    if (status !== 'authenticated' || !enabled || !jobId) return;
    const controller = new AbortController();
    const stream = async () => {
      try {
        await streamJob(
          apiUrl(syncJobStreamUrl(jobId)),
          authHeaders(),
          syncJobSchema,
          (job) => {
            queryClient.setQueryData(queryKey, job);
            if (terminalStatuses.has(job.status)) {
              void queryClient.invalidateQueries({ queryKey: jobKeys.all });
            }
          },
          (job) => terminalStatuses.has(job.status),
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) notifyApiError(err as Error);
      }
    };
    void stream();
    return () => controller.abort();
  }, [jobId, enabled, status, queryClient, queryKey]);

  return job;
}
