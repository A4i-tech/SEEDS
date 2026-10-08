import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { approveReview, getArtifactMarkdown, saveReviewDraft, reviewKeys } from '../api/review';
import { jobKeys } from '@features/jobs/types/job.types';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useReviewText(jobId: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && jobId !== '';

  const raw = useQuery({ queryKey: reviewKeys.raw(jobId), queryFn: () => getArtifactMarkdown(jobId, 'raw'), enabled });
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
      void navigate({ to: routePaths.review });
    },
    onError: notifyApiError,
  });

  return {
    raw: raw.data ?? '',
    corrected: corrected.data ?? '',
    isLoading: raw.isLoading || corrected.isLoading,
    loadError: toApiErrorMessage(raw.error ?? corrected.error),
    save,
    approve,
  };
}
