import { Alert, Breadcrumbs, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { CONTENT_UI } from '@features/library/types/content.types';
import type { ContentItem } from '@features/library/types/content.types';
import { QuizPreview } from '@features/library/components/ContentPreview';
import { useReviewQuiz } from '../hooks/useReviewQuiz';

export function ReviewQuizScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { item, isLoading, loadError, approve } = useReviewQuiz(id);

  const ui = item ? CONTENT_UI[item.type] : undefined;
  const title = item?.title.english || id;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.quizEyebrow')}</Text>
      <Title order={2}>{t('review.quizTitle')}</Title>
      <Text c="dimmed">{t('review.quizHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && <Alert>{loadError}</Alert>}
      {item && ui?.preview !== 'quiz' && <Alert>{t('review.wrongItem')}</Alert>}

      {ui?.preview === 'quiz' && item && (
        <>
          <Paper p="lg" radius="md">
            <QuizPreview item={item as Extract<ContentItem, { type: 'quiz' }>} />
          </Paper>
          <Group gap="md">
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              {t('review.approve')}
            </Button>
            <Button variant="subtle" onClick={() => void navigate({ to: routePaths.review })}>
              {t('review.backQueue')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
