import { z } from 'zod';
import { remediationStatusSchema } from '@features/jobs/types/job.types';
import { count, text } from '@shared/utils/schema';

export const remediationJobDetailSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  language: z.string(),
  detected_language: text,
  status: remediationStatusSchema,
  stage: text,
  stage_index: z.number(),
  stage_count: z.number(),
  artifacts: z.record(z.string(), z.string()),
  counts: z.record(z.string(), z.number()),
  progress: z.object({
    message: text,
    percent: count,
  }),
  draft_remediated_md: text,
  verified_at: text,
  verified_by: text,
  title: text,
  target_language: text,
  translation_error: text,
  error: text,
  created_at: z.string(),
  finished_at: text,
  metrics: z.object({
    total_pages: count,
    processed_pages: count,
    diagrams_described: count,
    tables_fixed: count,
    flagged_items_count: count,
  }),
});

export type RemediationJobDetail = z.infer<typeof remediationJobDetailSchema>;
