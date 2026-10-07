import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { auditEntrySchema, type AuditEntry, type ExtractItem } from '../types/localize.types';

const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;

const runtimeTranslationsSchema = z.record(z.string(), z.string());

export async function extractItems(siteId: string, items: ExtractItem[]): Promise<{ status?: string }> {
  const { data } = await apiClient.post('/translations/extract', { site_id: siteId, items });
  return data as { status?: string };
}

export async function getRuntimeTranslations(
  siteId: string,
  route: string,
  lang: string,
): Promise<Record<string, string>> {
  const { data } = await apiClient.get('/translations', {
    params: { site_id: siteId, route, lang },
  });
  return runtimeTranslationsSchema.parse(data);
}

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

export async function getAuditTrail(siteId: string, route?: string, key?: string): Promise<AuditEntry[]> {
  const { data } = await apiClient.get('/translations/audit', {
    params: { site_id: siteId, route, key },
  });
  return z.array(auditEntrySchema).parse(data);
}
