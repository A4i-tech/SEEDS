import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { analyticsKeys } from '@features/analytics/types/analytics.types';

export function useRegistrationRefresh() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['registration'] });
    void queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
  };
  const saved = () => { notifications.show({ message: t('registration.saved') }); invalidate(); };
  return { invalidate, saved };
}
