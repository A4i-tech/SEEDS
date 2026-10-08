import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { jobKeys } from '@features/jobs/types/job.types';
import { libraryKeys } from '../../library/types/content.types';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useCreateMutationOptions(successKey: string, target: typeof routePaths.library | typeof routePaths.jobs) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return {
    onSuccess: () => {
      notifications.show({ message: t(successKey) });
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void queryClient.invalidateQueries({ queryKey: jobKeys.all });
      void navigate({ to: target });
    },
    onError: notifyApiError,
  };
}
