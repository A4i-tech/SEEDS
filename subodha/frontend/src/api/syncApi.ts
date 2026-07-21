import {
  ContentListResponseSchema,
  StartSyncResponseSchema,
  SyncJobSchema,
  type ContentItem,
  type StartSyncResponse,
  type SyncJob,
} from '../types/sync';

export const API_BASE = '/api';

export interface StartSyncOptions {
  onlyNew: boolean;
}

/**
 * Kick off a new Subodha sync job.
 */
export async function startSyncJob(options: StartSyncOptions): Promise<StartSyncResponse> {
  const res = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(`start failed: ${res.status}`);
  }
  return StartSyncResponseSchema.parse(await res.json());
}

/**
 * Fetch the current status/progress of a sync job.
 */
export async function fetchSyncStatus(jobId: string): Promise<SyncJob> {
  const res = await fetch(`${API_BASE}/sync/status/${jobId}`);
  if (!res.ok) {
    throw new Error(`status ${res.status}`);
  }
  return SyncJobSchema.parse(await res.json());
}

/**
 * Fetch the full live content catalog, merged with each item's sync status.
 */
export async function fetchContentList(): Promise<ContentItem[]> {
  const res = await fetch(`${API_BASE}/courses`);
  if (!res.ok) {
    throw new Error(`courses failed: ${res.status}`);
  }
  return ContentListResponseSchema.parse(await res.json()).courses;
}

/**
 * Kick off a sync job scoped to a single piece of content (course).
 */
export async function startCourseSyncJob(courseId: string): Promise<StartSyncResponse> {
  const res = await fetch(`${API_BASE}/sync/course/${encodeURIComponent(courseId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`start failed: ${res.status}`);
  }
  return StartSyncResponseSchema.parse(await res.json());
}
