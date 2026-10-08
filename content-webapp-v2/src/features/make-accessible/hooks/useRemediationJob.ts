import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { streamJob } from '@shared/services/sse';
import { apiUrl, authHeaders } from '@shared/services/apiClient';
import { getRemediationJob, remediationJobStreamUrl } from '../api/remediation';
import { remediationJobDetailSchema } from '../types/remediation.types';

const terminalStatuses = new Set(['ready_to_review', 'in_review', 'verified', 'failed']);

export function useRemediationJob(jobId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const queryKey = useMemo(() => ['remediation', 'job', jobId], [jobId]);

  const job = useQuery({
    queryKey,
    queryFn: () => getRemediationJob(jobId),
    enabled: status === 'authenticated',
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && !terminalStatuses.has(data.status) ? 5000 : false;
    },
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    const controller = new AbortController();
    void streamJob(
      apiUrl(remediationJobStreamUrl(jobId)),
      authHeaders(),
      remediationJobDetailSchema,
      (job) => {
        queryClient.setQueryData(queryKey, job);
        if (terminalStatuses.has(job.status)) {
          notifications.show({ message: t('makeAccessible.jobUpdated', { name: job.source_name }) });
          void queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [jobId, status, queryClient, queryKey, t]);

  return job;
}
