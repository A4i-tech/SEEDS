import { Alert, Breadcrumbs, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CONTENT_UI } from '@features/library/types/content.types';
import type { ContentItem } from '@features/library/types/content.types';
import { QuizPreview } from '@features/library/components/ContentPreview';
import { useReviewQuiz } from '../hooks/useReviewQuiz';

export function ReviewQuizScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { state, approve } = useReviewQuiz(id);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{state.status === 'done' ? state.data.title.english || id : id}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.quizEyebrow')}</Text>
      <Title order={2}>{t('review.quizTitle')}</Title>
      <Text c="dimmed">{t('review.quizHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && CONTENT_UI[state.data.type].preview !== 'quiz' && (
        <Alert>{t('review.wrongItem')}</Alert>
      )}
      {state.status === 'done' && CONTENT_UI[state.data.type].preview === 'quiz' && (
        <>
          <Paper p="lg" radius="md">
            <QuizPreview item={state.data as Extract<ContentItem, { type: 'quiz' }>} />
          </Paper>
          <Group gap="md">
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              {t('review.approve')}
            </Button>
            <Button variant="subtle" onClick={() => void navigate({ to: '/review' })}>
              {t('review.backQueue')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
