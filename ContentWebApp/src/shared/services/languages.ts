import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

const languageSchema = z.object({
  code: z.string(),
  name: z.string(),
});

const languagesResponseSchema = z.object({ languages: z.array(languageSchema) });

export async function getLanguages() {
  const { data } = await apiClient.get('/v1/languages');
  return languagesResponseSchema.parse(data).languages;
}
