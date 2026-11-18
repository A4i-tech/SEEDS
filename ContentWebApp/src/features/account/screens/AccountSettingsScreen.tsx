import { SegmentedControl, Stack, Switch, Text, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useContrast, type Contrast } from '@shared/hooks/useContrast';
import { useDisplayPreferences, type TextSize } from '@shared/hooks/useDisplayPreferences';
import { PageTitle } from '@shared/components/PageTitle';

export function AccountSettingsScreen() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');
  const [contrast, setContrast] = useContrast();
  const { textSize, setTextSize, reduceMotion, setReduceMotion, underlineLinks, setUnderlineLinks } = useDisplayPreferences();

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
    </Stack>
  );
}
