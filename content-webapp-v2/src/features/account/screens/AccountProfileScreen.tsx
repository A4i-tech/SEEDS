import { Button, Stack, Text, Title } from '@mantine/core';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useSessionRole, useTenantMe } from '../hooks/useAccount';

export function AccountProfileScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const sessionRole = useSessionRole();
  const { data, error } = useTenantMe();
  const loadError = toApiErrorMessage(error);

  const confirmSignOut = () => {
    openConfirmDialog({
      title: t('account.signOutTitle'),
      body: t('account.signOutBody'),
      confirmLabel: t('account.signOutConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        logout();
        void navigate(routePaths.login);
      },
    });
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('account.profileTitle')}</Title>
      {sessionRole && <Text c="dimmed">{t('account.sessionRole', { role: sessionRole })}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {data && (
        <Stack gap="xs">
          <Text>
            {t('account.fieldName')}: {data.name}
          </Text>
          {data.email && (
            <Text>
              {t('account.fieldEmail')}: {data.email}
            </Text>
          )}
          {data.phone_number && (
            <Text>
              {t('account.fieldPhone')}: {data.phone_number}
            </Text>
          )}
          {data.tenant_name && (
            <Text>
              {t('account.fieldTenant')}: {data.tenant_name}
            </Text>
          )}
          {data.organisation && (
            <Text>
              {t('account.fieldOrganisation')}: {data.organisation}
            </Text>
          )}
        </Stack>
      )}
      <Button onClick={confirmSignOut}>{t('account.signOut')}</Button>
    </Stack>
  );
}
