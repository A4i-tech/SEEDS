import { Alert, Button, Group, Paper, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { UserAvatar } from '@shared/components/UserAvatar';
import { useTranslation } from 'react-i18next';
import { useSignOut } from '@features/auth/hooks/useSignOut';
import { useRole } from '@features/auth/store/useAuthStore';
import { LoadError } from '@shared/components/LoadError';
import { toApiState } from '@shared/utils/apiState';
import { zodValidate } from '@shared/utils/schema';
import { useChangePassword, useMe } from '../hooks/useAccount';
import { PageTitle } from '@shared/components/PageTitle';

const passwordSchema = z.object({
  current_password: z.string().min(1, 'validation.required'),
  new_password: z.string().min(1, 'validation.required'),
});

type PasswordValues = z.infer<typeof passwordSchema>;

export function AccountProfileScreen() {
  const { t } = useTranslation();
  const confirmSignOut = useSignOut();
  const sessionRole = useRole();
  const state = toApiState(useMe());
  const { mutate: changePassword, isPending, isSuccess, error } = useChangePassword();

  const form = useForm<PasswordValues>({
    initialValues: { current_password: '', new_password: '' },
    validate: zodValidate(passwordSchema),
  });

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
      {sessionRole === 'tenant' && (
        <Paper p="lg" radius="lg">
          <form onSubmit={form.onSubmit((values) => changePassword(values, { onSuccess: () => form.reset() }))}>
            <Stack gap="md">
              <PasswordInput
                label={t('account.currentPassword')}
                autoComplete="current-password"
                required
                {...form.getInputProps('current_password')}
              />
              <PasswordInput
                label={t('account.newPassword')}
                autoComplete="new-password"
                required
                {...form.getInputProps('new_password')}
              />
              {error && <Alert>{error.message}</Alert>}
              {isSuccess && <Text c="green">{t('account.passwordSaved')}</Text>}
              <Button type="submit" fullWidth loading={isPending}>
                {t('account.savePassword')}
              </Button>
            </Stack>
          </form>
        </Paper>
      )}
      <Button onClick={confirmSignOut}>{t('account.signOut')}</Button>
    </Stack>
  );
}
