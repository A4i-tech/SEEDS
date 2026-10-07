import { Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { useReviewQuiz } from '../hooks/useReviewQuiz';
import classes from './ReviewQuizScreen.module.css';

const optionLabels = ['A', 'B', 'C', 'D'];

export function ReviewQuizScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { item, isLoading, loadError, approve } = useReviewQuiz(id);

  const isQuiz = item?.type === 'quiz';
  const title = item?.title?.english ?? id;

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
      {item && !isQuiz && (
        <Text c="red" role="alert">
          {t('review.wrongItem')}
        </Text>
      )}

      {isQuiz && item.type === 'quiz' && (
        <Stack gap="md" className={classes.panel}>
          {(item.questions ?? []).map((q, index) => (
            <Stack key={q.question.id} gap="xs">
              <Text fw={700}>
                {t('library.questionN', { n: index + 1 })}: {q.question.text}
              </Text>
              {(q.options ?? []).map((opt, optIdx) => (
                <Text key={opt.id} size="sm" c={opt.id === q.correct_option_id ? undefined : 'dimmed'}>
                  {optionLabels[optIdx] ?? opt.id}. {opt.text}
                  {opt.id === q.correct_option_id ? ` ${t('library.correctAnswer')}` : ''}
                </Text>
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      {isQuiz && (
        <Group gap="md">
          <Button
            className={classes.submitButton}
            loading={approve.isPending}
            onClick={() => void approve.mutateAsync()}
          >
            {t('review.approve')}
          </Button>
          <Button variant="subtle" onClick={() => void navigate(routePaths.review)}>
            {t('review.backQueue')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
