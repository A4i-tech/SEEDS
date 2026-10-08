import { useTranslation } from 'react-i18next';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { notifyApiError } from '@shared/utils/notifyApiError';

export function useConfirmRemove() {
  const { t } = useTranslation();
  return (title: string, confirmLabel: string, remove: () => Promise<unknown>) =>
    openConfirmDialog({
      title,
      body: t('registration.deleteBody'),
      confirmLabel,
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void remove().catch(notifyApiError);
      },
    });
}
