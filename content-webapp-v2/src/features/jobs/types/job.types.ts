import { z } from 'zod';

export const remediationStatusSchema = z.enum([
  'pending',
  'running',
  'ready_to_review',
  'in_review',
  'verified',
  'failed',
]);

const jobProgressSchema = z.object({
  message: z.string().nullable(),
  percent: z.number().nullable(),
});

export const remediationJobSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  language: z.string(),
  detected_language: z.string().nullable(),
  status: remediationStatusSchema,
  stage: z.string().nullable().optional(),
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
  draft_remediated_md: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
  verified_by: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  target_language: z.string().nullable().optional(),
  translation_error: z.string().nullable().optional(),
  error: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});

export type RemediationJob = z.infer<typeof remediationJobSchema>;

export const syncStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const syncJobSchema = z.object({
  job_id: z.string(),
  scope: z.string(),
  course_id: z.string().nullable(),
  status: syncStatusSchema,
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  total_courses: z.number().nullish(),
  processed: z.number(),
  stats: z.object({
    saved: z.number(),
    skipped: z.number(),
    empty: z.number(),
    failed: z.number(),
  }),
  error: z.string().nullable(),
});

export type SyncJob = z.infer<typeof syncJobSchema>;

export const jobTypeSchema = z.enum(['make-accessible', 'course-sync', 'localize', 'create']);
export type JobType = z.infer<typeof jobTypeSchema>;

export const jobStatusSchema = z.enum(['running', 'needs-review', 'done', 'failed']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export interface JobRow {
  id: string;
  title: string;
  subtitle: string;
  type: JobType;
  status: JobStatus;
  updated: string;
}

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
    subtitle: job.status === 'failed' && job.error ? job.error : '',
    type: 'make-accessible',
    status: remediationStatusMap[job.status],
    updated: job.finished_at ?? job.created_at,
  }));
  const fromSync: JobRow[] = sync.map((job) => ({
    id: job.job_id,
    title: job.scope === 'course' && job.course_id ? job.course_id : 'All courses',
    subtitle: syncSubtitle(job),
    type: 'course-sync',
    status: syncStatusMap[job.status],
    updated: job.finished_at ?? job.started_at ?? '',
  }));
  return [...fromRemediation, ...fromSync].sort((a, b) => b.updated.localeCompare(a.updated));
}
