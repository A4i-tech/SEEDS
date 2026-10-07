import { z } from 'zod';

export const remediationJobDetailSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  language: z.string(),
  detected_language: z.string().nullable(),
  status: z.string(),
  stage: z.string().nullable(),
  stage_index: z.number(),
  stage_count: z.number(),
  artifacts: z.record(z.string(), z.string()),
  counts: z.record(z.string(), z.number()).optional(),
  progress: z.object({
    message: z.string().nullable(),
    percent: z.number().nullable(),
  }),
  draft_remediated_md: z.string().nullable(),
  verified_at: z.string().nullable(),
  verified_by: z.string().nullable(),
  title: z.string().nullable(),
  target_language: z.string().nullable(),
  translation_error: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  metrics: z.object({
    total_pages: z.number().nullable(),
    processed_pages: z.number().nullable(),
    diagrams_described: z.number().nullable(),
    tables_fixed: z.number().nullable(),
    flagged_items_count: z.number().nullable(),
  }),
});

export type RemediationJobDetail = z.infer<typeof remediationJobDetailSchema>;
