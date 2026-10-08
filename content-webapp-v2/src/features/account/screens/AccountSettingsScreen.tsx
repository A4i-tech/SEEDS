import { Alert, Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useChangePassword } from '../hooks/useAccount';

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(1, 'Required'),
});

type PasswordValues = z.infer<typeof passwordSchema>;

export function AccountSettingsScreen() {
  const { t } = useTranslation();
  const { mutate: changePassword, isPending, isSuccess, error } = useChangePassword();


  const form = useForm<PasswordValues>({
    initialValues: { current_password: '', new_password: '' },
    validate: zodResolver(passwordSchema),
  });

  return (
    <Stack gap="md">
      <Title order={2}>{t('account.settingsTitle')}</Title>
      <Text c="dimmed">{t('account.settingsDescription')}</Text>
      <Paper shadow="sm" p="xl" radius="md" w={420} maw="100%">
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
    </Stack>
  );
}
