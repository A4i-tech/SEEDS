import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { QuizCreate } from '../../library/types/content.types';
import { createQuiz } from '../api/quiz';

export function useCreateQuiz() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: QuizCreate) => createQuiz(payload),
    onSuccess: () => {
      notifications.show({ message: t('create.quizSaved') });
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void navigate({ to: routePaths.library });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });
}
