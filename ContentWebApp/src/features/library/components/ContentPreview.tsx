import { Alert, Box, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toApiState } from '@shared/utils/apiState';
import { getContentSasUrl } from '../api/library';
import { libraryKeys } from '../types/content.types';
import type { AudioContentItem, ContentItem } from '../types/content.types';

export function AudioPreview({ item }: { item: AudioContentItem }) {
  const { t } = useTranslation();
  const [track] = item.audio_content;
  const audioUrl = item.primary_audio_url || track?.audio_url || '';
  const audio = useQuery({
    queryKey: libraryKeys.contentAudio(item.id),
    queryFn: () => getContentSasUrl(audioUrl),
    enabled: audioUrl !== '',
  });
  const audioState = toApiState(audio);
  const audioError = audioState.status === 'error' ? audioState.error.message : '';
  return (
    <Stack gap="xs">
      <Text fw={700}>{t('library.audio')}</Text>
      {audioState.status === 'done' && item.is_processed && audioUrl !== '' && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <Box component="audio" controls src={audioState.data} w="100%" />
      )}
      {audioUrl === '' && <Text c="dimmed">{t('library.audioMissing')}</Text>}
      {audioError && <Alert>{audioError}</Alert>}
      {!item.is_processed && <Text c="dimmed">{t('library.audioProcessing')}</Text>}
      {track?.description && (
        <Text size="sm" c="dimmed">
          {track.description}
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
      {item.questions.map((q, index) => (
        <Stack key={q.question.id} gap="xs">
          <Text fw={700}>
            {t('library.questionN', { n: index + 1 })}: {q.question.text}
          </Text>
          {q.options.map((opt, optIdx) => (
            <Text key={opt.id} size="sm" c={opt.id === q.correct_option_id ? undefined : 'dimmed'}>
              {optionLabels[optIdx] ?? opt.id}. {opt.text}
              {opt.id === q.correct_option_id && ` ${t('library.correctAnswer')}`}
            </Text>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
