import { z } from 'zod';
import { ApiError, apiClient } from '@shared/services/apiClient';
import { contentCreateSchema } from '../../library/types/content.types';
import type { ContentCreate } from '../../library/types/content.types';

const sasTokenSchema = z.object({ sas_token: z.string() });

const jobScheduledSchema = z.object({
  message: z.string(),
  job_id: z.string(),
});

export async function getUploadSasUrl(blobName: string) {
  const { data } = await apiClient.get('/content/sasToken', { params: { blob_name: blobName } });
  return sasTokenSchema.parse(data).sas_token;
}

export async function uploadMp3ToSasUrl(sasUrl: string, file: File) {
  const response = await fetch(sasUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'audio/mpeg' },
    body: file,
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
}

export async function createContent(payload: ContentCreate) {
  const parsed = contentCreateSchema.parse(payload);
  const { data } = await apiClient.post('/content', parsed);
  return jobScheduledSchema.parse(data);
}
