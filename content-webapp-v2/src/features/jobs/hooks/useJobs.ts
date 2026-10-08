import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { combineStates, toApiState } from '@shared/utils/apiState';
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

  const state = combineStates({ remediation: toApiState(remediation), sync: toApiState(sync) });
  if (state.status !== 'done') return state;

  const activeIds = new Set((activeSync.data ?? []).map((job) => job.job_id));
  const rows = toJobRows(state.data.remediation, state.data.sync).map((row): JobRow => {
    if (!activeIds.has(row.id) || row.status === 'failed') return row;
    return { ...row, status: 'running' };
  });

  return { status: 'done' as const, data: rows };
}
