import { Alert, Box, Breadcrumbs, Button, Group, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { useReviewAudio } from '../hooks/useReviewAudio';
import classes from './ReviewAudioScreen.module.css';

export function ReviewAudioScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { item, audioUrl, audioSrc, isLoading, loadError, approve } = useReviewAudio(id);

  const isAudio = item && item.type !== 'quiz';
  const title = item?.title.english || id;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.audioEyebrow')}</Text>
      <Title order={2}>{t('review.audioTitle')}</Title>
      <Text c="dimmed">{t('review.audioHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && <Alert>{loadError}</Alert>}
      {item && !isAudio && <Alert>{t('review.wrongItem')}</Alert>}
      {isAudio && !isLoading && !audioUrl && <Alert>{t('review.audioMissing')}</Alert>}

      {isAudio && (
        <>
          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('review.playback')}</Text>
              {item.is_processed && audioUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <Box component="audio" controls src={audioSrc} w="100%" />
              )}
              {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
            </Stack>
          </Paper>

          <Paper p="lg" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('review.script')}</Text>
              <ScrollArea.Autosize mah="40vh" role="document" aria-label={t('review.script')} aria-readonly="true">
                <Text className={classes.script}>{item.description}</Text>
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
              onClick={() => void navigate({ to: `${routePaths.review}/audio/$id/edit`, params: { id } })}
            >
              {t('review.editAudio')}
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate(item.description || undefined)}>
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
