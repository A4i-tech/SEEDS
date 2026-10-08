import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;

const runtimeTranslationsSchema = z.record(z.string(), z.string());

export async function generateForReview(
  siteId: string,
  route: string,
  lang: string,
): Promise<Record<string, string>> {
  const { data } = await apiClient.post('/translations/generate', undefined, {
    params: { site_id: siteId, route, lang },
    timeoutMs: GENERATE_TIMEOUT_MS,
  });
  return runtimeTranslationsSchema.parse(data);
}
