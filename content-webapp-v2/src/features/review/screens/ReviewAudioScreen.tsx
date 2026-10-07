import { Breadcrumbs, Button, Group, Stack, Text, Title } from '@mantine/core';
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
  const transcript = isAudio ? (item.description ?? '') : '';
  const title = item?.title?.english ?? id;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text className={classes.eyebrow}>{t('review.audioEyebrow')}</Text>
      <Title order={2}>{t('review.audioTitle')}</Title>
      <Text c="dimmed">{t('review.audioHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {item && !isAudio && (
        <Text c="red" role="alert">
          {t('review.wrongItem')}
        </Text>
      )}
      {isAudio && !isLoading && !audioUrl && (
        <Text c="red" role="alert">
          {t('review.audioMissing')}
        </Text>
      )}

      {isAudio && (
        <>
          <Stack gap="xs" className={classes.panel}>
            <Text fw={700}>{t('review.playback')}</Text>
            {item.is_processed && audioUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={audioSrc} className={classes.player} />
            )}
            {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
          </Stack>

          <Stack gap="xs" className={classes.panel}>
            <Text fw={700}>{t('review.script')}</Text>
            <div className={classes.scriptPane} role="document" aria-label={t('review.script')} aria-readonly="true">
              <Text>{transcript}</Text>
            </div>
            <Text size="sm" c="dimmed">
              {t('review.scriptLocked')}
            </Text>
          </Stack>

          <Stack gap="xs" className={classes.panel}>
            <Text fw={700}>{t('review.listenCheck')}</Text>
            <Text size="sm">{t('review.checkPronunciation')}</Text>
            <Text size="sm">{t('review.checkPace')}</Text>
            <Text size="sm">{t('review.checkSegment')}</Text>
            <Text size="sm" c="dimmed">
              {t('review.needChange')}
            </Text>
          </Stack>

          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={() => void navigate({ to: `${routePaths.review}/audio/$id/edit`, params: { id } })}
            >
              {t('review.editAudio')}
            </Button>
            <Button
              className={classes.submitButton}
              loading={approve.isPending}
              onClick={() => void approve.mutateAsync(transcript || undefined)}
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
