import { z } from 'zod';
import { text } from '@shared/utils/schema';

export const remediationStatusSchema = z.enum([
  'pending',
  'running',
  'ready_to_review',
  'in_review',
  'verified',
  'failed',
]);

export const remediationJobSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  status: remediationStatusSchema,
  draft_remediated_md: text,
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
  total_courses: z.number(),
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
  'make-accessible': '/make-accessible',
  'course-sync': '/library',
  localize: '/localize',
  create: '/create',
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

export function syncTitle(job: SyncJob): string {
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

export const jobKeys = {
  all: ['jobs'] as const,
  remediation: ['jobs', 'remediation'] as const,
  remediationDetail: (jobId: string) => ['jobs', 'remediation', 'detail', jobId] as const,
  sync: ['jobs', 'sync'] as const,
  syncActive: ['jobs', 'sync', 'active'] as const,
  syncDetail: (jobId: string) => ['jobs', 'sync', 'detail', jobId] as const,
  syncItems: (jobId: string) => ['jobs', 'sync', 'items', jobId] as const,
};

export const JOB_ACTION: Record<JobStatus, { labelKey: string; variant: 'outline' | 'transparent' }> = {
  failed: { labelKey: 'jobs.fix', variant: 'outline' },
  'needs-review': { labelKey: 'jobs.continue', variant: 'outline' },
  running: { labelKey: 'jobs.view', variant: 'transparent' },
  done: { labelKey: 'jobs.view', variant: 'transparent' },
};

export const REMEDIATION_UI: Record<
  z.infer<typeof remediationStatusSchema>,
  { step: 1 | 2; view: 'running' | 'done'; terminal: boolean }
> = {
  pending: { step: 1, view: 'running', terminal: false },
  running: { step: 1, view: 'running', terminal: false },
  ready_to_review: { step: 2, view: 'done', terminal: true },
  in_review: { step: 2, view: 'done', terminal: true },
  verified: { step: 2, view: 'done', terminal: true },
  failed: { step: 1, view: 'running', terminal: true },
};
