import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { approveReview, getArtifactMarkdown, saveReviewDraft } from '../api/review';

export function useReviewText(jobId: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && jobId !== '';

  const raw = useQuery({ queryKey: ['review', jobId, 'raw'], queryFn: () => getArtifactMarkdown(jobId, 'raw'), enabled });
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
      void navigate({ to: routePaths.review });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });

  return { raw: raw.data ?? '', corrected: corrected.data ?? '', isLoading: raw.isLoading || corrected.isLoading, save, approve };
}
