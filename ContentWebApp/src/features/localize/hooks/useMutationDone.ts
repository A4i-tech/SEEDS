import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useMutationDone(queryKeys: QueryKey[]) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (key: string) => ({
    onSuccess: () => {
      notifications.show({ message: t(key) });
      queryKeys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
    },
    onError: notifyApiError,
  });
}
