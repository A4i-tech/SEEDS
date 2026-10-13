import { Alert, Box, Breadcrumbs, Button, Group, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useReviewAudio } from '../hooks/useReviewAudio';
import classes from './ReviewAudioScreen.module.css';

export function ReviewAudioScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { state, audioUrl, approve } = useReviewAudio(id);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{state.status === 'done' ? state.data.content.title.english || id : id}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.audioEyebrow')}</Text>
      <Title order={2}>{t('review.audioTitle')}</Title>
      <Text c="dimmed">{t('review.audioHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && state.data.content.type === 'quiz' && <Alert>{t('review.wrongItem')}</Alert>}
      {state.status === 'done' && state.data.content.type !== 'quiz' && (
        <>
          {!audioUrl && <Alert>{t('review.audioMissing')}</Alert>}
          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('review.playback')}</Text>
              {state.data.content.is_processed && audioUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <Box component="audio" controls src={state.data.audio} w="100%" />
              )}
              {!state.data.content.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
            </Stack>
          </Paper>

          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('review.script')}</Text>
              <ScrollArea.Autosize mah="40vh" role="document" aria-label={t('review.script')} aria-readonly="true">
                <Text className={classes.script}>{state.data.content.description}</Text>
              </ScrollArea.Autosize>
              <Text size="sm" c="dimmed">
                {t('review.scriptLocked')}
              </Text>
            </Stack>
          </Paper>

          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('review.listenCheck')}</Text>
              <Text size="sm">{t('review.checkPronunciation')}</Text>
              <Text size="sm">{t('review.checkPace')}</Text>
              <Text size="sm">{t('review.checkSegment')}</Text>
              <Text size="sm" c="dimmed">
                {t('review.needChange')}
              </Text>
            </Stack>
          </Paper>

          <Group gap="md">
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/review/audio/$id/edit', params: { id } })}
            >
              {t('review.editAudio')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() => approve.mutate(state.data.content.description || undefined)}
            >
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
