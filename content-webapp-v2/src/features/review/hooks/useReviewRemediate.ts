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
  reviewKeys,
  saveReviewDraft,
} from '../api/review';
import { jobKeys } from '@features/jobs/types/job.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useReviewRemediate(jobId: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && jobId !== '';

  const job = useQuery({ queryKey: reviewKeys.detail(jobId), queryFn: () => getReviewJob(jobId), enabled });
  const summary = useQuery({
    queryKey: reviewKeys.summary(jobId),
    queryFn: () => getReviewSummary(jobId),
    enabled,
  });
  const corrected = useQuery({
    queryKey: reviewKeys.corrected(jobId),
    queryFn: () => getArtifactMarkdown(jobId, 'corrected'),
    enabled,
  });

  const save = useMutation({
    mutationFn: (draftMd: string) => saveReviewDraft(jobId, draftMd),
    onSuccess: () => {
      notifications.show({ message: t('review.saved') });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.job(jobId) });
    },
    onError: notifyApiError,
  });

  const approve = useMutation({
    mutationFn: (title?: string) => approveReview(jobId, title),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void queryClient.invalidateQueries({ queryKey: jobKeys.all });
      void navigate({ to: `${routePaths.review}/approved`, state: { title: job.data?.source_name ?? jobId } });
    },
    onError: notifyApiError,
  });

  return {
    job: job.data,
    summary: summary.data,
    draftSeed: job.data?.draft_remediated_md || corrected.data || '',
    isLoading: job.isLoading || summary.isLoading || corrected.isLoading,
    loadError:
      toApiErrorMessage(job.error) ||
      toApiErrorMessage(summary.error) ||
      toApiErrorMessage(corrected.error),
    save,
    approve,
  };
}
