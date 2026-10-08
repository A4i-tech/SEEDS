import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

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
      <Title order={2}>{t('review.approvedTitle')}</Title>
      {state.title && <Text fw={700}>{state.title}</Text>}
      <Text c="dimmed">{t('review.approvedBody')}</Text>
      <Group gap="md">
        <Button onClick={() => void navigate({ to: '/review' })}>{t('review.backQueue')}</Button>
      </Group>
    </Stack>
  );
}
