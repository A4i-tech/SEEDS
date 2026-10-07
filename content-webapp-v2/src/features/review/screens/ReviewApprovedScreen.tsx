import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import classes from './ReviewApprovedScreen.module.css';

export function ReviewApprovedScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useLocation().state as { title?: string } | null;

  return (
    <Stack gap="md" className={classes.wrap}>
      <Text className={classes.eyebrow}>{t('review.title')}</Text>
      <Title order={2}>{t('review.approvedTitle')}</Title>
      {state?.title && <Text fw={700}>{state.title}</Text>}
      <Text c="dimmed">{t('review.approvedBody')}</Text>
      <Group gap="md">
        <Button className={classes.submitButton} onClick={() => void navigate(routePaths.review)}>
          {t('review.backQueue')}
        </Button>
      </Group>
    </Stack>
  );
}
