import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodValidate } from '@shared/utils/schema';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useContrast, type Contrast } from '@app/theme/useContrast';
import { useRole } from '@features/auth/store/useAuthStore';
import { useChangePassword } from '../hooks/useAccount';
import { PageTitle } from '@shared/components/PageTitle';

const passwordSchema = z.object({
  current_password: z.string().min(1, 'validation.required'),
  new_password: z.string().min(1, 'validation.required'),
});

type PasswordValues = z.infer<typeof passwordSchema>;

export function AccountSettingsScreen() {
  const { t } = useTranslation();
  const role = useRole();
  const { mutate: changePassword, isPending, isSuccess, error } = useChangePassword();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');
  const [contrast, setContrast] = useContrast();


  const form = useForm<PasswordValues>({
    initialValues: { current_password: '', new_password: '' },
    validate: zodValidate(passwordSchema),
  });

  return (
    <Stack gap="md">
      <PageTitle title={t('account.settingsTitle')} />
      <Text c="dimmed">{t('account.settingsDescription')}</Text>
      <Stack gap="xs">
        <Text variant="label">{t('account.theme')}</Text>
        <SegmentedControl
          value={computedColorScheme}
          onChange={(v) => setColorScheme(v as 'dark' | 'light')}
          data={[
            { value: 'light', label: t('account.themeLight') },
            { value: 'dark', label: t('account.themeDark') },
          ]}
        />
      </Stack>
      <Stack gap="xs">
        <Text variant="label">{t('account.contrast')}</Text>
        <SegmentedControl
          value={contrast}
          onChange={(v) => setContrast(v as Contrast)}
          data={[
            { value: 'standard', label: t('account.contrastStandard') },
            { value: 'high', label: t('account.contrastHigh') },
          ]}
        />
      </Stack>
      {role === 'tenant' && (
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
      )}
    </Stack>
  );
}
