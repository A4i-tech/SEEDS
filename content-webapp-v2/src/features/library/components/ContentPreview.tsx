import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getContentSasUrl } from '../api/library';
import type { ContentItem } from '../types/content.types';
import classes from './ContentPreview.module.css';

const DEFAULT_AUDIO_HOST = 'https://seedsblob.blob.core.windows.net/output-container';

export function AudioPreview({ item }: { item: Extract<ContentItem, { type: 'story' | 'song' | 'poem' | 'snippet' }> }) {
  const { t } = useTranslation();
  const audioUrl =
    item.primary_audio_url ?? item.audio_content?.[0]?.audio_url ?? `${DEFAULT_AUDIO_HOST}/${item.id}/1.0.wav`;
  const audio = useQuery({
    queryKey: ['library', 'content', item.id, 'audio'],
    queryFn: () => getContentSasUrl(audioUrl),
  });
  const audioError = toApiErrorMessage(audio.error);
  return (
    <Stack gap="xs">
      <Text fw={700}>{t('library.audio')}</Text>
      {item.is_processed && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={audio.data ?? ''} className={classes.player} />
      )}
      {audioError && (
        <Text c="red" role="alert">
          {audioError}
        </Text>
      )}
      {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
      {item.audio_content?.[0]?.description && (
        <Text size="sm" c="dimmed">
          {item.audio_content[0].description}
        </Text>
      )}
    </Stack>
  );
}

export function QuizPreview({ item }: { item: Extract<ContentItem, { type: 'quiz' }> }) {
  const { t } = useTranslation();
  const optionLabels = ['A', 'B', 'C', 'D'];
  return (
    <Stack gap="md">
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
  );
}
