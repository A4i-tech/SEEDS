import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodValidate } from '@shared/utils/schema';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useContrast, type Contrast } from '@shared/hooks/useContrast';
import { useDisplayPreferences, type TextSize } from '@shared/hooks/useDisplayPreferences';
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
  const { textSize, setTextSize, reduceMotion, setReduceMotion, underlineLinks, setUnderlineLinks } = useDisplayPreferences();


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
        <Text variant="label">{t('account.textSize')}</Text>
        <SegmentedControl
          value={textSize}
          onChange={(v) => setTextSize(v as TextSize)}
          data={[
            { value: 'default', label: t('account.textSizeDefault') },
            { value: 'large', label: t('account.textSizeLarge') },
            { value: 'xlarge', label: t('account.textSizeXlarge') },
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
      <Switch
        label={t('account.reduceMotion')}
        description={t('account.reduceMotionHint')}
        checked={reduceMotion}
        onChange={(e) => setReduceMotion(e.currentTarget.checked)}
      />
      <Switch
        label={t('account.underlineLinks')}
        description={t('account.underlineLinksHint')}
        checked={underlineLinks}
        onChange={(e) => setUnderlineLinks(e.currentTarget.checked)}
      />
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
