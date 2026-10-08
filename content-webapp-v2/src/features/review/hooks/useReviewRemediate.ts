import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import {
  approveReview,
  getArtifactMarkdown,
  getReviewJob,
  getReviewSummary,
  saveReviewDraft,
} from '../api/review';

export function useReviewRemediate(jobId: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && jobId !== '';

  const job = useQuery({ queryKey: ['review', jobId, 'job'], queryFn: () => getReviewJob(jobId), enabled });
  const summary = useQuery({
    queryKey: ['review', jobId, 'summary'],
    queryFn: () => getReviewSummary(jobId),
    enabled,
  });
  const corrected = useQuery({
    queryKey: ['review', jobId, 'corrected'],
    queryFn: () => getArtifactMarkdown(jobId, 'corrected'),
    enabled,
  });

  const save = useMutation({
    mutationFn: (draftMd: string) => saveReviewDraft(jobId, draftMd),
    onSuccess: () => {
      notifications.show({ message: t('review.saved') });
      void queryClient.invalidateQueries({ queryKey: ['review', jobId] });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  const approve = useMutation({
    mutationFn: (title?: string) => approveReview(jobId, title),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void navigate({ to: `${routePaths.review}/approved`, state: { title: job.data?.source_name ?? jobId } });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  return {
    job: job.data,
    summary: summary.data,
    corrected: corrected.data ?? '',
    draftSeed: job.data?.draft_remediated_md ?? corrected.data ?? '',
    isLoading: job.isLoading || summary.isLoading || corrected.isLoading,
    loadError:
      toApiErrorMessage(job.error) ||
      toApiErrorMessage(summary.error) ||
      toApiErrorMessage(corrected.error),
    save,
    approve,
  };
}
