import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function HomeScreen() {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Title order={2}>{t('home.title')}</Title>
      <Text c="dimmed">{t('home.welcome')}</Text>
    </Stack>
  );
}
