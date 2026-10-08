import { Breadcrumbs, Button, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { AudioContentItem } from '@features/library/types/content.types';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useReviewAudio } from '../hooks/useReviewAudio';
import classes from './ReviewAudioEditScreen.module.css';

type AudioReview = ReturnType<typeof useReviewAudio>;

interface AudioEditorProps {
  item: AudioContentItem;
  audioSrc: string;
  save: AudioReview['save'];
  approve: AudioReview['approve'];
}

function AudioEditor({ item, audioSrc, save, approve }: AudioEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [transcript, setTranscript] = useState(item.description);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    try {
      await save.mutateAsync(transcript);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <>
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
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
          onChange={(e) => setTranscript(e.currentTarget.value)}
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
        <Button variant="subtle" onClick={() => void navigate({ to: `${routePaths.review}/audio/$id`, params: { id: item.id } })}>
          {t('review.backListen')}
        </Button>
      </Group>
    </>
  );
}

export function ReviewAudioEditScreen() {
  const { t } = useTranslation();
  const { id = '' } = useParams({ strict: false });
  const { item, audioSrc, isLoading, loadError, save, approve } = useReviewAudio(id);

  const title = item?.title.english || id;

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
      {item?.type === 'quiz' && (
        <Text c="red" role="alert">
          {t('review.wrongItem')}
        </Text>
      )}
      {item && item.type !== 'quiz' && (
        <AudioEditor key={item.id} item={item} audioSrc={audioSrc} save={save} approve={approve} />
      )}
    </Stack>
  );
}
