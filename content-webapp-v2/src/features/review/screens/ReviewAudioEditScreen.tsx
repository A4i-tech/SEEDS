import { Breadcrumbs, Button, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useReviewAudio } from '../hooks/useReviewAudio';
import classes from './ReviewAudioEditScreen.module.css';

export function ReviewAudioEditScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams({ strict: false });
  const { item, audioSrc, isLoading, loadError, save, approve } = useReviewAudio(id);
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAudio = item && item.type !== 'quiz';
  const transcript = edited ?? (isAudio ? (item.description ?? '') : '');
  const title = item?.title?.english ?? id;

  const handleSave = async () => {
    setError(null);
    try {
      await save.mutateAsync(transcript);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text className={classes.eyebrow}>{t('review.audioEyebrow')}</Text>
      <Title order={2}>{t('review.editAudioTitle')}</Title>
      <Text c="dimmed">{t('review.editAudioHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      {item && !isAudio && (
        <Text c="red" role="alert">
          {t('review.wrongItem')}
        </Text>
      )}

      {isAudio && (
        <>
          <Stack gap="xs" className={classes.panel}>
            <Text fw={700}>{t('review.playback')}</Text>
            {item.is_processed && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={audioSrc} className={classes.player} />
            )}
            {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
          </Stack>

          <Stack gap="xs">
            <Text fw={700}>{t('review.transcript')}</Text>
            <Textarea
              value={transcript}
              onChange={(e) => setEdited(e.currentTarget.value)}
              autosize
              minRows={12}
              aria-label={t('review.transcript')}
              className={classes.editPane}
            />
          </Stack>

          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              loading={save.isPending}
              onClick={() => void handleSave()}
            >
              {t('review.editAction')}
            </Button>
            <Button
              className={classes.submitButton}
              loading={approve.isPending}
              onClick={() => void approve.mutateAsync(transcript || undefined)}
            >
              {t('review.approve')}
            </Button>
            <Button variant="subtle" onClick={() => void navigate({ to: `${routePaths.review}/audio/$id`, params: { id } })}>
              {t('review.backListen')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
