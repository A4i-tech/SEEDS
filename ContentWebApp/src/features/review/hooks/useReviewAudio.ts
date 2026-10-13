import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getContentById, getContentSasUrl } from '@features/library/api/library';
import { toApiState } from '@shared/utils/apiState';
import type { ContentItem } from '@features/library/types/content.types';
import { reviewKeys, updateReviewContent } from '../api/review';
import { notifyApiError } from '@shared/utils/notifyApiError';

function audioUrlOf(item: ContentItem): string {
  if (item.type === 'quiz') return '';
  return item.audio_content[0].audio_url;
}

export function useReviewAudio(id: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const enabled = status === 'authenticated' && id !== '';

  const content = useQuery({
    queryKey: reviewKeys.audio(id),
    queryFn: async () => {
      const item = await getContentById(id);
      const audioUrl = audioUrlOf(item);
      return { content: item, audio: audioUrl && (await getContentSasUrl(audioUrl)) };
    },
    enabled,
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
    mutationFn: (description: string) => updateReviewContent(id, { description }),
    onSuccess: () => {
      notifications.show({ message: t('review.approved') });
      void navigate({
        to: `/review/approved`,
        state: { title: (content.data && content.data.content.title.english) || id },
      });
    },
    onError: notifyApiError,
  });

  return { state: toApiState(content), save, approve };
}
