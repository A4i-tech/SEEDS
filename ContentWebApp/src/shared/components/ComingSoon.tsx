import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" role="region" aria-label={title}>
      <Title order={2}>{title}</Title>
      <Text c="dimmed">{t('common.comingSoon')}</Text>
    </Stack>
  );
}
