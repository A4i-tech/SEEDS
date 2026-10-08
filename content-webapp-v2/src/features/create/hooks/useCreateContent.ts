import { useMutation } from '@tanstack/react-query';
import type { ContentCreate } from '../../library/types/content.types';
import { createContent, getUploadSasUrl, uploadMp3ToSasUrl } from '../api/content';
import { useCreateMutationOptions } from './useCreateMutationOptions';

interface AudioUploadInput {
  file: File;
  payload: ContentCreate;
}

export function useCreateContentText() {
  return useMutation({
    mutationFn: createContent,
    ...useCreateMutationOptions('create.aiSaved', '/library'),
  });
}

export function useCreateContentAudio() {
  return useMutation({
    mutationFn: async ({ file, payload }: AudioUploadInput) => {
      const sasUrl = await getUploadSasUrl(`${crypto.randomUUID()}.mp3`);
      await uploadMp3ToSasUrl(sasUrl, file);
      return createContent({ ...payload, audio_content: [{ audio_url: sasUrl.split('?')[0] }] });
    },
    ...useCreateMutationOptions('create.contentSaved', '/jobs'),
  });
}
