import { apiClient } from '@shared/services/apiClient';

const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;

export async function generateForReview(siteId: string, route: string, lang: string) {
  await apiClient.post('/translations/generate', undefined, {
    params: { site_id: siteId, route, lang },
    timeoutMs: GENERATE_TIMEOUT_MS,
  });
}
