import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

export const languageSchema = z.object({
  code: z.string(),
  standard: z.string(),
  name: z.string(),
});

export type Language = z.infer<typeof languageSchema>;

const languagesResponseSchema = z.object({ languages: z.array(languageSchema) });

export async function getLanguages() {
  const { data } = await apiClient.get('/v1/languages');
  return languagesResponseSchema.parse(data).languages;
}
