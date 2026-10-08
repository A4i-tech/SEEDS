import { z } from 'zod';
import { text } from '@shared/utils/schema';

function numberOrAbsent(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  return value;
}

const absentableCount = z.number().nullish().transform(numberOrAbsent);

export const remediationJobDetailSchema = z.object({
  job_id: z.string(),
  source_name: z.string(),
  language: z.string(),
  detected_language: text,
  status: z.string(),
  stage: text,
  stage_index: z.number(),
  stage_count: z.number(),
  artifacts: z.record(z.string(), z.string()),
  counts: z.record(z.string(), z.number()).optional(),
  progress: z.object({
    message: text,
    percent: absentableCount,
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
    total_pages: absentableCount,
    processed_pages: absentableCount,
    diagrams_described: absentableCount,
    tables_fixed: absentableCount,
    flagged_items_count: absentableCount,
  }),
});

export type RemediationJobDetail = z.infer<typeof remediationJobDetailSchema>;
