import { Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { QuizPreview } from '@features/library/components/ContentPreview';
import { useReviewQuiz } from '../hooks/useReviewQuiz';
import classes from './ReviewQuizScreen.module.css';

export function ReviewQuizScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { item, isLoading, loadError, approve } = useReviewQuiz(id);

  const title = item?.title.english || id;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text className={classes.eyebrow}>{t('review.quizEyebrow')}</Text>
      <Title order={2}>{t('review.quizTitle')}</Title>
      <Text c="dimmed">{t('review.quizHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {item && item.type !== 'quiz' && (
        <Text c="red" role="alert">
          {t('review.wrongItem')}
        </Text>
      )}

      {item?.type === 'quiz' && (
        <>
          <Stack gap="md" className={classes.panel}>
            <QuizPreview item={item} />
          </Stack>
          <Group gap="md">
            <Button
              className={classes.submitButton}
              loading={approve.isPending}
              onClick={() => void approve.mutateAsync()}
            >
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
