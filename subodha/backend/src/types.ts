"use strict";
import { z } from "zod";

export const SubodhaCourseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    org: z.string(),
    number: z.string(),
    short_description: z.string().nullable(),
    language: z.string().nullable(),
    start: z.string(),
    pacing: z.string(),
    hidden: z.boolean(),
    invitation_only: z.boolean(),
    mobile_available: z.boolean(),
  })
  .passthrough();
export type SubodhaCourse = z.infer<typeof SubodhaCourseSchema>;

export const CoursesPageResponseSchema = z.object({
  results: z.array(SubodhaCourseSchema),
  pagination: z.object({ next: z.string().nullable().default(null) }).default({ next: null }),
});
export type CoursesPageResponse = z.infer<typeof CoursesPageResponseSchema>;

export const SubodhaBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    display_name: z.string().default(""),
    student_view_data: z.unknown().nullable().default(null),
    student_view_html: z.string().default(""),
    student_view_url: z.string().default(""),
    lms_web_url: z.string().default(""),
  })
  .passthrough();
export type SubodhaBlock = z.infer<typeof SubodhaBlockSchema>;

export const BlocksResponseSchema = z
  .object({
    root: z.string().default(""),
    blocks: z.record(z.string(), SubodhaBlockSchema).default({}),
  })
  .passthrough();
export type BlocksResponse = z.infer<typeof BlocksResponseSchema>;

export const VideoDataSchema = z.object({
  sources: z.array(z.string()).default([]),
  streams: z.string().default(""),
  poster: z.string().nullable().default(null),
  transcriptLanguages: z.record(z.string(), z.string()).default({}),
});
export type VideoData = z.infer<typeof VideoDataSchema>;

// ---------------------------------------------------------------------------
// Internal domain types
// ---------------------------------------------------------------------------

export const NormalizedBlockSchema = z.object({
  blockId: z.string(),
  type: z.string(),
  displayName: z.string(),
  html: z.string(),
  studentViewData: z.unknown().nullable(),
  lmsUrl: z.string(),
});
export type NormalizedBlock = z.infer<typeof NormalizedBlockSchema>;

export const UrlMapSchema = z.record(z.string(), z.string());
export type UrlMap = z.infer<typeof UrlMapSchema>;

export const MappedCourseSchema = z.object({
  sourceId: z.string(),
  source: z.literal("subodha"),
  contentHash: z.string(),
  title: z.string(),
  org: z.string(),
  courseNumber: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  start: z.date(),
  pacing: z.string(),
  hidden: z.boolean(),
  invitationOnly: z.boolean(),
  mobileAvailable: z.boolean(),
  blocks: z.array(NormalizedBlockSchema),
  assets: UrlMapSchema,
  lastRunId: z.string(),
  fetchedAt: z.date(),
});
export type MappedCourse = z.infer<typeof MappedCourseSchema>;

export const RetryOptionsSchema = z.object({
  retries: z.number().default(5),
  baseDelay: z.number().default(5000),
  label: z.string().default(""),
});
export type RetryOptions = z.input<typeof RetryOptionsSchema>;

export const SyncOptionsSchema = z.object({
  limit: z.number().default(Infinity),
  dryRun: z.boolean().default(false),
  runId: z.string().default(() => crypto.randomUUID()),
});
export type SyncOptions = z.input<typeof SyncOptionsSchema> & {
  onProgress?: (progress: SyncProgress) => void;
};

export const SyncProgressSchema = z.object({
  processed: z.number(),
  total: z.number(),
  courseId: z.string().default(""),
  status: z.string().default(""),
});
export type SyncProgress = z.infer<typeof SyncProgressSchema>;

export const SyncFailureSchema = z.object({
  courseId: z.string(),
  error: z.string(),
});
export type SyncFailure = z.infer<typeof SyncFailureSchema>;

export const SyncSummarySchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  totalCourses: z.number(),
  processed: z.number(),
  stats: z.record(z.string(), z.number()),
  permanentFailures: z.array(SyncFailureSchema),
  dlqProcessed: z.number().default(0),
});
export type SyncSummary = z.infer<typeof SyncSummarySchema>;

export const JobStatusSchema = z.enum(["running", "completed", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const CourseDiffSchema = z.object({
  totalLive: z.number(),
  totalStored: z.number(),
  newCount: z.number(),
  removedCount: z.number(),
  newCourseIds: z.array(z.string()),
  removedCourseIds: z.array(z.string()),
  liveCourses: z.array(SubodhaCourseSchema),
});
export type CourseDiff = z.infer<typeof CourseDiffSchema>;

export const JobSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  diff: CourseDiffSchema.nullable(),
  progress: SyncProgressSchema.nullable(),
  result: SyncSummarySchema.nullable(),
  error: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const StartSyncRequestSchema = z.object({
  onlyNew: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  webhookUrl: z.string().nullable().default(null),
  limit: z.number().nullable().default(null),
});
export type StartSyncRequest = z.infer<typeof StartSyncRequestSchema>;

export const StartCourseSyncRequestSchema = z.object({
  dryRun: z.boolean().default(false),
  webhookUrl: z.string().nullable().default(null),
});
export type StartCourseSyncRequest = z.infer<typeof StartCourseSyncRequestSchema>;

export const ContentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  org: z.string(),
  number: z.string(),
  language: z.string().nullable(),
  hidden: z.boolean(),
  synced: z.boolean(),
  lastSyncedAt: z.date(),
  lastRunId: z.string(),
});
export type ContentListItem = z.infer<typeof ContentListItemSchema>;
