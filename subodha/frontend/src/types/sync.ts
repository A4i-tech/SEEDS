import { z } from 'zod';

// Mirrors backend/src/schemas.ts wire shapes.

export const SyncStatsSchema = z.object({
  saved: z.number().default(0),
  skipped: z.number().default(0),
  empty: z.number().default(0),
  failed: z.number().default(0),
});
export type SyncStats = z.infer<typeof SyncStatsSchema>;

export const SyncFailureSchema = z.object({
  courseId: z.string(),
  error: z.string(),
});
export type SyncFailure = z.infer<typeof SyncFailureSchema>;

export const SyncProgressSchema = z.object({
  processed: z.number(),
  total: z.number(),
  courseId: z.string().default(''),
  status: z.string().default(''),
});
export type SyncProgress = z.infer<typeof SyncProgressSchema>;

export const SyncSummarySchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  totalCourses: z.number(),
  processed: z.number(),
  stats: SyncStatsSchema,
  permanentFailures: z.array(SyncFailureSchema),
  dlqProcessed: z.number().default(0),
});
export type SyncSummary = z.infer<typeof SyncSummarySchema>;
export type SyncResult = SyncSummary;

export const JobStatusSchema = z.enum(['running', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const SyncJobSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  progress: SyncProgressSchema.nullable(),
  result: SyncSummarySchema.nullable(),
  error: z.string().nullable(),
});
export type SyncJob = z.infer<typeof SyncJobSchema>;

export const StartSyncResponseSchema = z.object({
  jobId: z.string(),
});
export type StartSyncResponse = z.infer<typeof StartSyncResponseSchema>;

export const StartSyncRequestSchema = z.object({
  onlyNew: z.boolean(),
});
export type StartSyncRequest = z.infer<typeof StartSyncRequestSchema>;


export const SyncEventTypeSchema = z.enum(['started', 'progress', 'completed', 'failed']);
export type SyncEventType = z.infer<typeof SyncEventTypeSchema>;

export const SyncEventSchema = z.object({
  type: SyncEventTypeSchema,
  at: z.string(),
  jobId: z.string().default(''),
  courseId: z.string().default(''),
  status: z.string().default(''),
  processed: z.number().default(0),
  total: z.number().default(0),
  result: SyncSummarySchema.nullable().default(null),
  error: z.string().default(''),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;
export type NewSyncEvent = Omit<SyncEvent, 'at'>;

export const ContentItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  org: z.string(),
  number: z.string(),
  language: z.string().nullable(),
  hidden: z.boolean(),
  synced: z.boolean(),
  lastSyncedAt: z.string(),
  lastRunId: z.string(),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const ContentListResponseSchema = z.object({
  courses: z.array(ContentItemSchema),
});
export type ContentListResponse = z.infer<typeof ContentListResponseSchema>;

export const CourseSyncStatusSchema = z.enum(['idle', 'running', 'completed', 'failed']);
export type CourseSyncStatus = z.infer<typeof CourseSyncStatusSchema>;

export const CourseSyncStateSchema = z.object({
  status: CourseSyncStatusSchema,
  jobId: z.string().default(''),
  error: z.string().default(''),
});
export type CourseSyncState = z.infer<typeof CourseSyncStateSchema>;
