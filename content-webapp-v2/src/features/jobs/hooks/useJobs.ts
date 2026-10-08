import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getRemediationJobs } from '../api/remediationJobs';
import { getActiveSyncJobs, getSyncJobs } from '../api/syncJobs';
import { jobKeys, toJobRows, type JobRow } from '../types/job.types';

export function useJobs() {
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated';

  const remediation = useQuery({ queryKey: jobKeys.remediation, queryFn: () => getRemediationJobs(), enabled });
  const sync = useQuery({ queryKey: jobKeys.sync, queryFn: () => getSyncJobs(), enabled });
  const activeSync = useQuery({
    queryKey: jobKeys.syncActive,
    queryFn: getActiveSyncJobs,
    enabled,
    refetchInterval: 5000,
  });

  const { data: remediationJobs = [] } = remediation;
  const { data: syncJobs = [] } = sync;
  const { data: activeSyncJobs = [] } = activeSync;
  const activeIds = new Set(activeSyncJobs.map((job) => job.job_id));
  const rows = toJobRows(remediationJobs, syncJobs).map((row): JobRow => {
    if (!activeIds.has(row.id) || row.status === 'failed') return row;
    return { ...row, status: 'running' };
  });

  return {
    rows,
    isLoading: remediation.isLoading || sync.isLoading,
    error: remediation.error ?? sync.error,
  };
}
