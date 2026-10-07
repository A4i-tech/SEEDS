import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { deleteRemediationJob, getRemediationJobs } from '../api/remediationJobs';
import { getActiveSyncJobs, getSyncJobs } from '../api/syncJobs';
import { toJobRows } from '../types/job.types';

export function useJobs() {
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated';
  const queryClient = useQueryClient();

  const remediation = useQuery({ queryKey: ['jobs', 'remediation'], queryFn: () => getRemediationJobs(), enabled });
  const sync = useQuery({ queryKey: ['jobs', 'sync'], queryFn: () => getSyncJobs(), enabled });
  const activeSync = useQuery({
    queryKey: ['jobs', 'sync', 'active'],
    queryFn: getActiveSyncJobs,
    enabled,
    refetchInterval: 5000,
  });

  const activeIds = new Set((activeSync.data ?? []).map((job) => job.job_id));
  const rows = toJobRows(remediation.data ?? [], sync.data ?? []).map((row) =>
    activeIds.has(row.id) && row.status !== 'failed' ? { ...row, status: 'running' as const } : row,
  );

  const remove = useMutation({
    mutationFn: deleteRemediationJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'remediation'] });
    },
  });

  return {
    rows,
    isLoading: remediation.isLoading || sync.isLoading,
    error: remediation.error ?? sync.error,
    remove: remove.mutateAsync,
  };
}
