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
      return data && !terminalStatuses.has(data.status) ? 5000 : false;
    },
  });

  useEffect(() => {
    if (status !== 'authenticated' || !enabled || !jobId) return;
    const controller = new AbortController();
    void streamJob(
      apiUrl(syncJobStreamUrl(jobId)),
      authHeaders(),
      syncJobSchema,
      (job) => {
        queryClient.setQueryData(queryKey, job);
        if (terminalStatuses.has(job.status)) {
          void queryClient.invalidateQueries({ queryKey: jobKeys.all });
        }
      },
      controller.signal,
    ).catch((err: Error) => {
      if (!controller.signal.aborted) notifyApiError(err);
    });
    return () => controller.abort();
  }, [jobId, enabled, status, queryClient, queryKey]);

  return job;
}
