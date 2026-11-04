import { Button, Group, Stack, Text } from '@mantine/core';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@shared/components/PageTitle';

declare module '@tanstack/history' {
  interface HistoryState {
    title?: string;
  }
}

export function ReviewApprovedScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();

  return (
    <Stack gap="md" maw={640}>
      <Text variant="eyebrow">{t('review.title')}</Text>
      <PageTitle title={t('review.approvedTitle')} />
      {state.title && <Text variant="rowTitle">{state.title}</Text>}
      <Text c="dimmed">{t('review.approvedBody')}</Text>
      <Group gap="md">
        <Button onClick={() => void navigate({ to: '/review' })}>{t('review.backQueue')}</Button>
      </Group>
    </Stack>
  );
}
