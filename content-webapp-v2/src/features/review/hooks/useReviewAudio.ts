import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getContentById, getContentSasUrl } from '@features/library/api/library';
import { combineStates, toApiState } from '@shared/utils/apiState';
import type { ContentItem } from '@features/library/types/content.types';
import { reviewKeys, updateReviewContent } from '../api/review';
import { notifyApiError } from '@shared/utils/notifyApiError';

function audioUrlOf(item: ContentItem | undefined): string {
  if (!item || item.type === 'quiz') return '';
  return item.primary_audio_url || item.audio_content[0]?.audio_url || '';
}

export function useReviewAudio(id: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && id !== '';

  const content = useQuery({
    queryKey: reviewKeys.audio(id),
    queryFn: () => getContentById(id),
    enabled,
  });

  const item = content.data;
  const audioUrl = audioUrlOf(item);

  const audio = useQuery({
    queryKey: reviewKeys.audioSas(id),
    queryFn: () => getContentSasUrl(audioUrl),
    enabled: enabled && audioUrl !== '',
  });

  const save = useMutation({
    mutationFn: (description: string) => updateReviewContent(id, { description }),
    onSuccess: () => {
      notifications.show({ message: t('review.saved') });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.audio(id) });
    },
    onError: notifyApiError,
  });

  const approve = useMutation({
    mutationFn: (description?: string) => updateReviewContent(id, { description }),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void navigate({ to: `/review/approved`, state: { title: item?.title.english || id } });
    },
    onError: notifyApiError,
  });

  const audioState = audioUrl === '' ? { status: 'done' as const, data: '' } : toApiState(audio);
  const state = combineStates({ content: toApiState(content), audio: audioState });

  return { state, audioUrl, save, approve };
}
