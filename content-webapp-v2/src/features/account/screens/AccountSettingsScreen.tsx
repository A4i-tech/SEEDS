import { Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useChangePassword } from '../hooks/useAccount';

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(1, 'Required'),
});

type PasswordValues = z.infer<typeof passwordSchema>;

export function AccountSettingsScreen() {
  const { t } = useTranslation();
  const { mutateAsync: changePassword, isPending } = useChangePassword();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<PasswordValues>({
    initialValues: { current_password: '', new_password: '' },
    validate: zodResolver(passwordSchema),
  });

  const handleSubmit = async (values: PasswordValues) => {
    setError(null);
    setSaved(false);
    try {
      await changePassword(values);
      setSaved(true);
      form.reset();
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('account.settingsTitle')}</Title>
      <Text c="dimmed">{t('account.settingsDescription')}</Text>
      <Paper withBorder shadow="sm" p="xl" radius="md" w={420} maw="100%">
        <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
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
            {error && (
              <Text c="red" role="alert">
                {error}
              </Text>
            )}
            {saved && <Text c="green">{t('account.passwordSaved')}</Text>}
            <Button type="submit" fullWidth loading={isPending}>
              {t('account.savePassword')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
