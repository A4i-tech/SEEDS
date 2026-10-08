import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { ContentCreate } from '../../library/types/content.types';
import { createContent, getUploadSasUrl, uploadMp3ToSasUrl } from '../api/content';

function useCreateBase(target: typeof routePaths.library | typeof routePaths.jobs, successKey: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return { t, navigate, queryClient, target, successKey };
}

export function useCreateContentText() {
  const { t, navigate, queryClient, target, successKey } = useCreateBase(routePaths.library, 'create.aiSaved');
  return useMutation({
    mutationFn: (payload: ContentCreate) => createContent(payload),
    onSuccess: () => {
      notifications.show({ message: t(successKey) });
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void navigate({ to: target });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });
}

interface AudioUploadInput {
  file: File;
  payload: ContentCreate;
}

export function useCreateContentAudio() {
  const { t, navigate, queryClient } = useCreateBase(routePaths.jobs, 'create.contentSaved');
  return useMutation({
    mutationFn: async ({ file, payload }: AudioUploadInput) => {
      const sasUrl = await getUploadSasUrl(`${crypto.randomUUID()}.mp3`);
      await uploadMp3ToSasUrl(sasUrl, file);
      return createContent({ ...payload, audio_content: [{ audio_url: sasUrl.split('?')[0] }] });
    },
    onSuccess: () => {
      notifications.show({ message: t('create.contentSaved') });
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void navigate({ to: routePaths.jobs });
    },
    onError: (err) => {
      const message = toApiErrorMessage(err);
      if (message) notifications.show({ color: 'red', message });
    },
  });
}
