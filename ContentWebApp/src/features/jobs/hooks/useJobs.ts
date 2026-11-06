import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useRole } from '@features/auth/store/useAuthStore';
import { combineStates, toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { deleteRemediationJob } from '@features/make-accessible/api/remediation';
import { getRemediationJobs } from '../api/remediationJobs';
import { getActiveSyncJobs, getSyncJobs } from '../api/syncJobs';
import { jobKeys, toJobRows, type JobRow } from '../types/job.types';

export function useDeleteRemediationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRemediationJob,
    onSettled: () => queryClient.invalidateQueries({ queryKey: jobKeys.remediation }),
    onError: notifyApiError,
  });
}

export function useJobs() {
  const status = useAuthStore((s) => s.status);
  const role = useRole();
  const enabled = status === 'authenticated';
  const syncEnabled = enabled && role === 'tenant';

  const remediation = useQuery({ queryKey: jobKeys.remediation, queryFn: () => getRemediationJobs(200), enabled });
  const sync = useQuery({
    queryKey: jobKeys.sync,
    queryFn: () => getSyncJobs(),
    enabled: syncEnabled,
    ...(!syncEnabled && { initialData: [] }),
  });
  const activeSync = useQuery({
    queryKey: jobKeys.syncActive,
    queryFn: getActiveSyncJobs,
    enabled: syncEnabled,
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
