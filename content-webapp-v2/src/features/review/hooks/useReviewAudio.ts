import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getContentById, getContentSasUrl } from '@features/library/api/library';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { ContentItem } from '@features/library/types/content.types';
import { updateReviewContent } from '../api/review';
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
    queryKey: ['review', 'audio', id],
    queryFn: () => getContentById(id),
    enabled,
  });

  const item = content.data;
  const audioUrl = audioUrlOf(item);

  const audio = useQuery({
    queryKey: ['review', 'audio', id, 'sas'],
    queryFn: () => getContentSasUrl(audioUrl),
    enabled: enabled && audioUrl !== '',
  });

  const save = useMutation({
    mutationFn: (description: string) => updateReviewContent(id, { description }),
    onSuccess: () => {
      notifications.show({ message: t('review.saved') });
      void queryClient.invalidateQueries({ queryKey: ['review', 'audio', id] });
    },
    onError: notifyApiError,
  });

  const approve = useMutation({
    mutationFn: (description?: string) => updateReviewContent(id, { description }),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void navigate({ to: `${routePaths.review}/approved`, state: { title: item?.title.english || id } });
    },
    onError: notifyApiError,
  });

  return {
    item,
    audioUrl,
    audioSrc: audio.data ?? '',
    isLoading: content.isLoading || audio.isLoading,
    loadError: toApiErrorMessage(content.error) || toApiErrorMessage(audio.error),
    save,
    approve,
  };
}
