import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { text } from '@shared/utils/schema';
import { syncJobSchema } from '../types/job.types';

const syncJobsResponseSchema = z.object({ jobs: z.array(syncJobSchema) });

export async function getSyncJobs(limit = 20) {
  const { data } = await apiClient.get('/content-aggregators/sync/jobs', { params: { limit } });
  return syncJobsResponseSchema.parse(data).jobs;
}

export async function getActiveSyncJobs() {
  const { data } = await apiClient.get('/content-aggregators/sync/jobs/active');
  return syncJobsResponseSchema.parse(data).jobs;
}

const syncJobItemSchema = z.object({
  source_id: z.string(),
  name: z.string(),
  status: z.enum(['saved', 'skipped', 'empty', 'failed']),
  error: text,
  at: z.string(),
});

export type SyncJobItem = z.infer<typeof syncJobItemSchema>;

const syncJobItemsPageSchema = z.object({
  items: z.array(syncJobItemSchema),
  next_cursor: z.string().nullish().transform((value) => value ?? undefined),
  total: z.number(),
});

export async function getSyncStatus(jobId: string) {
  const { data } = await apiClient.get(`/content-aggregators/sync/status/${encodeURIComponent(jobId)}`);
  return syncJobSchema.parse(data);
}

export async function getSyncJobItems(jobId: string, params?: { limit?: number; after?: string }) {
  const { data } = await apiClient.get(`/content-aggregators/sync/status/${encodeURIComponent(jobId)}/items`, {
    params,
  });
  return syncJobItemsPageSchema.parse(data);
}

export function syncJobStreamUrl(jobId: string) {
  return `/content-aggregators/sync/stream/${encodeURIComponent(jobId)}`;
}
