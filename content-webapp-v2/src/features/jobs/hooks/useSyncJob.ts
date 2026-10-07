import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { apiUrl, authHeaders } from '@shared/services/apiClient';
import { streamEvents } from '@shared/services/sse';
import { getSyncStatus, syncJobStreamUrl } from '../api/syncJobs';
import { syncJobSchema } from '../types/job.types';

const streamEventSchema = z.object({ job: syncJobSchema }).passthrough();

const terminalStatuses = new Set(['completed', 'failed']);

export function useSyncJob(jobId: string, enabled = true) {
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const queryKey = useMemo(() => ['jobs', 'sync', 'detail', jobId], [jobId]);

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
    void streamEvents(apiUrl(syncJobStreamUrl(jobId)), authHeaders(), {
      signal: controller.signal,
      onEvent: (data) => {
        const parsed = streamEventSchema.safeParse(data);
        if (!parsed.success) return;
        queryClient.setQueryData(queryKey, parsed.data.job);
        if (terminalStatuses.has(parsed.data.job.status)) {
          void queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
      },
    }).catch(() => undefined);
    return () => controller.abort();
  }, [jobId, enabled, status, queryClient, queryKey]);

  return job;
}
