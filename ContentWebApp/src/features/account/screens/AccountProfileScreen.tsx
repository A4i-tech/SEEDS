import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { UserAvatar } from '@shared/components/UserAvatar';
import { useTranslation } from 'react-i18next';
import { useSignOut } from '@features/auth/hooks/useSignOut';
import { useRole } from '@features/auth/store/useAuthStore';
import { LoadError } from '@shared/components/LoadError';
import { toApiState } from '@shared/utils/apiState';
import { useMe } from '../hooks/useAccount';
import { PageTitle } from '@shared/components/PageTitle';

export function AccountProfileScreen() {
  const { t } = useTranslation();
  const confirmSignOut = useSignOut();
  const sessionRole = useRole();
  const state = toApiState(useMe());

  return (
    <Stack gap="md">
      <PageTitle title={t('account.profileTitle')} />
      <Text c="dimmed">{t('account.sessionRole', { role: sessionRole })}</Text>
      {state.status === 'error' && <LoadError error={state.error} />}
      {state.status === 'done' && (
        <Paper p="lg" radius="lg">
          <Group gap="lg" wrap="nowrap" align="flex-start">
            <UserAvatar name={state.data.name} size={72} />
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
              {state.data.tenant_name && (
                <Text>
                  {t('account.fieldTenant')}: {state.data.tenant_name}
                </Text>
              )}
              {state.data.organisation && (
                <Text>
                  {t('account.fieldOrganisation')}: {state.data.organisation}
                </Text>
              )}
            </Stack>
          </Group>
        </Paper>
      )}
      <Button onClick={confirmSignOut}>{t('account.signOut')}</Button>
    </Stack>
  );
}
