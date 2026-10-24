import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getContentById } from '@features/library/api/library';
import { toApiState } from '@shared/utils/apiState';
import { reviewKeys, updateReviewContent } from '../api/review';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useReviewQuiz(id: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);

  const content = useQuery({
    queryKey: reviewKeys.quiz(id),
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && id !== '',
  });

  const approve = useMutation({
    mutationFn: () => updateReviewContent(id, {}),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.quiz(id) });
      const item = content.data;
      void navigate({ to: `/review/approved`, state: { title: item?.title.english || id } });
    },
    onError: notifyApiError,
  });

  return { state: toApiState(content), approve };
}
