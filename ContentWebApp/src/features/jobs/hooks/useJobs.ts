import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useRole } from '@features/auth/store/useAuthStore';
import { notifications } from '@mantine/notifications';
import i18n from '@shared/i18n';
import { combineStates, toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { assignRemediationJob, deleteRemediationJob, getRemediationJobsAndBooks } from '../api/remediationJobs';
import { deleteBook, downloadBookArtifact, reorderBook, type BookFormat } from '../api/books';
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

export function useAssignRemediationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assignRemediationJob,
    onSettled: () => queryClient.invalidateQueries({ queryKey: jobKeys.remediation }),
    onError: notifyApiError,
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBook,
    onSettled: () => queryClient.invalidateQueries({ queryKey: jobKeys.remediation }),
    onError: notifyApiError,
  });
}

export function useReorderBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, jobIds }: { bookId: string; jobIds: string[] }) => reorderBook(bookId, jobIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKeys.remediation }),
  });
}

export function useDownloadBook(book: { book_id: string; title: string }) {
  return useMutation({
    mutationFn: (format: BookFormat) => downloadBookArtifact(book.book_id, format, `${book.title}.${format}`),
    onError: notifyApiError,
  });
}

export function useJobs() {
  const status = useAuthStore((s) => s.status);
  const role = useRole();
  const enabled = status === 'authenticated';
  const syncEnabled = enabled && role === 'tenant';

  const remediation = useQuery({ queryKey: jobKeys.remediation, queryFn: () => getRemediationJobsAndBooks(200), enabled });
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

  useEffect(() => {
    if (!remediation.data) return;
    const loaded = new Set(remediation.data.jobs.map((job) => job.job_id));
    remediation.data.books.forEach((book) => {
      const count = book.job_ids.filter((id) => !loaded.has(id)).length;
      if (count) notifications.show({ color: 'red', message: i18n.t('jobs.book.missingChapters', { title: book.title, count }) });
    });
  }, [remediation.data]);

  const state = combineStates({ remediation: toApiState(remediation), sync: toApiState(sync) });
  if (state.status !== 'done') return state;

  const activeIds = new Set((activeSync.data ?? []).map((job) => job.job_id));
  const rows = toJobRows(state.data.remediation.jobs, state.data.sync).map((row): JobRow => {
    if (!activeIds.has(row.id) || row.status === 'failed') return row;
    return { ...row, status: 'running' };
  });

  return { status: 'done' as const, data: rows, books: state.data.remediation.books };
}
