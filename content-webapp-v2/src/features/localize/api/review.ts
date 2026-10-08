import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import {
  bulkApproveResultSchema,
  translationItemSchema,
  type BulkApprove,
  type BulkApproveResult,
  type TranslationApprove,
  type TranslationItem,
  type TranslationUpdate,
} from '../types/localize.types';

const BULK_APPROVE_TIMEOUT_MS = 5 * 60 * 1000;

export async function listTranslations(siteId: string, route?: string): Promise<TranslationItem[]> {
  const { data } = await apiClient.get('/translations/list', {
    params: { site_id: siteId, route },
  });
  return z.array(translationItemSchema).parse(data);
}

export async function updateTranslation(id: string, update: TranslationUpdate): Promise<TranslationItem> {
  const { data } = await apiClient.put(`/translations/${encodeURIComponent(id)}`, update);
  return translationItemSchema.parse(data);
}

export async function approveTranslation(
  id: string,
  approval: TranslationApprove,
): Promise<TranslationItem> {
  const { data } = await apiClient.post(`/translations/${encodeURIComponent(id)}/approve`, approval);
  return translationItemSchema.parse(data);
}

export async function bulkApproveTranslations(
  siteId: string,
  scope: BulkApprove,
): Promise<BulkApproveResult> {
  const { data } = await apiClient.post(
    '/translations/bulk-approve',
    { route: scope.route, lang: scope.lang },
    { params: { site_id: siteId }, timeoutMs: BULK_APPROVE_TIMEOUT_MS },
  );
  return bulkApproveResultSchema.parse(data);
}
