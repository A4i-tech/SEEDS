import { Alert, Box, Breadcrumbs, Button, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AudioContentItem } from '@features/library/types/content.types';
import { useReviewAudio } from '../hooks/useReviewAudio';

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

  return (
    <>
      <Paper p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={700}>{t('review.playback')}</Text>
          {item.is_processed && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <Box component="audio" controls src={audioSrc} w="100%" />
          )}
          {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
        </Stack>
      </Paper>

      <Stack gap="xs">
        <Text fw={700}>{t('review.transcript')}</Text>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.currentTarget.value)}
          autosize
          minRows={12}
          aria-label={t('review.transcript')}
          styles={{ input: { fontFamily: 'monospace' } }}
        />
      </Stack>

      <Group gap="md">
        <Button variant="outline" loading={save.isPending} onClick={() => save.mutate(transcript)}>
          {t('review.editAction')}
        </Button>
        <Button loading={approve.isPending} onClick={() => approve.mutate(transcript || undefined)}>
          {t('review.approve')}
        </Button>
        <Button variant="subtle" onClick={() => void navigate({ to: `/review/audio/$id`, params: { id: item.id } })}>
          {t('review.backListen')}
        </Button>
      </Group>
    </>
  );
}

export function ReviewAudioEditScreen() {
  const { t } = useTranslation();
  const { id = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewAudio(id);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{state.status === 'done' ? state.data.content.title.english || id : id}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.audioEyebrow')}</Text>
      <Title order={2}>{t('review.editAudioTitle')}</Title>
      <Text c="dimmed">{t('review.editAudioHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && state.data.content.type === 'quiz' && <Alert>{t('review.wrongItem')}</Alert>}
      {state.status === 'done' && state.data.content.type !== 'quiz' && (
        <AudioEditor
          key={state.data.content.id}
          item={state.data.content}
          audioSrc={state.data.audio}
          save={save}
          approve={approve}
        />
      )}
    </Stack>
  );
}
