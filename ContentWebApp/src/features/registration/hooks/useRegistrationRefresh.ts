import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export function useRegistrationRefresh() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['registration'] }); };
  const saved = () => { notifications.show({ message: t('registration.saved') }); invalidate(); };
  return { invalidate, saved };
}
