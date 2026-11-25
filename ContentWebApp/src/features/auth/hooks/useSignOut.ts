import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { useAuthStore } from '../store/useAuthStore';

export function useSignOut() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  return () =>
    openConfirmDialog({
      title: t('account.signOutTitle'),
      body: t('account.signOutBody'),
      confirmLabel: t('account.signOutConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: async () => {
        if (await logout()) await navigate({ to: '/' });
      },
    });
}
