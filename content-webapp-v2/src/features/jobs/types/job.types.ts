import { z } from 'zod';
import { routePaths } from '@app/navigation/routePaths';
import { text } from '@shared/utils/schema';

const remediationStatusSchema = z.enum([
  'pending',
  'running',
  'ready_to_review',
  'in_review',
  'verified',
  'failed',
]);

const jobProgressSchema = z.object({
  message: text,
  percent: z.number().nullable(),
});

export const remediationJobSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  language: z.string(),
  detected_language: text,
  status: remediationStatusSchema,
  stage: text,
  stage_index: z.number(),
  stage_count: z.number(),
  artifacts: z.record(z.string(), z.string()),
  counts: z.record(z.string(), z.number()).optional(),
  metrics: z
    .object({
      total_pages: z.number().nullable(),
      processed_pages: z.number().nullable(),
      diagrams_described: z.number().nullable(),
      tables_fixed: z.number().nullable(),
      flagged_items_count: z.number().nullable(),
    })
    .optional(),
  progress: jobProgressSchema,
  draft_remediated_md: z.string().nullish(),
  verified_at: text,
  verified_by: text,
  title: text,
  target_language: text,
  translation_error: text,
  error: text,
  created_at: z.string(),
  finished_at: text,
});

export type RemediationJob = z.infer<typeof remediationJobSchema>;

const syncStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const syncJobSchema = z.object({
  job_id: z.string(),
  scope: z.string(),
  course_id: text,
  status: syncStatusSchema,
  started_at: text,
  finished_at: text,
  total_courses: z.number().nullish().transform((value) => value ?? 0),
  processed: z.number(),
  stats: z.object({
    saved: z.number(),
    skipped: z.number(),
    empty: z.number(),
    failed: z.number(),
  }),
  error: text,
});

export type SyncJob = z.infer<typeof syncJobSchema>;

const jobTypeSchema = z.enum(['make-accessible', 'course-sync', 'localize', 'create']);
export type JobType = z.infer<typeof jobTypeSchema>;

const jobStatusSchema = z.enum(['running', 'needs-review', 'done', 'failed']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export interface JobRow {
  id: string;
  title: string;
  subtitle: string;
  type: JobType;
  status: JobStatus;
  updated: string;
}

export const flowRoute: Record<JobType, string> = {
  'make-accessible': routePaths.makeAccessible,
  'course-sync': routePaths.library,
  localize: routePaths.localize,
  create: routePaths.create,
};

const remediationStatusMap: Record<z.infer<typeof remediationStatusSchema>, JobStatus> = {
  pending: 'running',
  running: 'running',
  ready_to_review: 'needs-review',
  in_review: 'needs-review',
  verified: 'done',
  failed: 'failed',
};

const syncStatusMap: Record<z.infer<typeof syncStatusSchema>, JobStatus> = {
  pending: 'running',
  running: 'running',
  completed: 'done',
  failed: 'failed',
};

export function failureSubtitle(job: RemediationJob): string {
  if (job.status === 'failed') return job.error;
  return '';
}

function syncTitle(job: SyncJob): string {
  if (job.scope === 'course' && job.course_id) return job.course_id;
  return 'All courses';
}

function syncSubtitle(job: SyncJob): string {
  const parts: string[] = [];
  if (job.stats.failed) parts.push(`${job.stats.failed} courses failed`);
  if (job.stats.saved) parts.push(`${job.stats.saved.toLocaleString()} saved`);
  if (job.stats.empty) parts.push(`${job.stats.empty} empty skipped`);
  if (job.stats.skipped) parts.push(`${job.stats.skipped} skipped`);
  return parts.join(' · ');
}

export function toJobRows(remediation: RemediationJob[], sync: SyncJob[]): JobRow[] {
  const fromRemediation: JobRow[] = remediation.map((job) => ({
    id: job.job_id,
    title: job.source_name,
    subtitle: failureSubtitle(job),
    type: 'make-accessible',
    status: remediationStatusMap[job.status],
    updated: job.finished_at || job.created_at,
  }));
  const fromSync: JobRow[] = sync.map((job) => ({
    id: job.job_id,
    title: syncTitle(job),
    subtitle: syncSubtitle(job),
    type: 'course-sync',
    status: syncStatusMap[job.status],
    updated: job.finished_at || job.started_at,
  }));
  return [...fromRemediation, ...fromSync].sort((a, b) => b.updated.localeCompare(a.updated));
}
