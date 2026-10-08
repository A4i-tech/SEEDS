import { Button, Stack, Text, Title } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { LoadError } from '@shared/components/LoadError';
import { toApiState } from '@shared/utils/apiState';
import { useTenantMe } from '../hooks/useAccount';

export function AccountProfileScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const sessionRole = useAuthStore((s) => s.role);
  const state = toApiState(useTenantMe());

  const confirmSignOut = () => {
    openConfirmDialog({
      title: t('account.signOutTitle'),
      body: t('account.signOutBody'),
      confirmLabel: t('account.signOutConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        logout();
        void navigate({ to: '/' });
      },
    });
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('account.profileTitle')}</Title>
      {sessionRole && <Text c="dimmed">{t('account.sessionRole', { role: sessionRole })}</Text>}
      {state.status === 'error' && <LoadError error={state.error} />}
      {state.status === 'done' && (
        <Stack gap="xs">
          <Text>
            {t('account.fieldName')}: {state.data.name}
          </Text>
          <Text>
            {t('account.fieldEmail')}: {state.data.email}
          </Text>
          {state.data.phone_number && (
            <Text>
              {t('account.fieldPhone')}: {state.data.phone_number}
            </Text>
          )}
          <Text>
            {t('account.fieldTenant')}: {state.data.tenant_name}
          </Text>
          {state.data.organisation && (
            <Text>
              {t('account.fieldOrganisation')}: {state.data.organisation}
            </Text>
          )}
        </Stack>
      )}
      <Button onClick={confirmSignOut}>{t('account.signOut')}</Button>
    </Stack>
  );
}
