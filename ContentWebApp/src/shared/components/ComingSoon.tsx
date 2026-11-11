import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@shared/components/PageTitle';

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" role="region" aria-label={title}>
      <PageTitle title={title} />
      <Text c="dimmed">{t('common.comingSoon')}</Text>
    </Stack>
  );
}
