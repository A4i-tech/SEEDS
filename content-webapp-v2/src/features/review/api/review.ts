import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { remediationJobSchema } from '@features/jobs/types/job.types';
import { contentUpdateSchema } from '@features/library/types/content.types';

export async function getArtifactMarkdown(jobId: string, name: 'raw' | 'corrected'): Promise<string> {
  const { data } = await apiClient.get<string>(
    `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/artifacts/${name}`,
  );
  return data;
}

export async function saveReviewDraft(jobId: string, draftMd: string): Promise<void> {
  await apiClient.put(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}/draft`, { draft_md: draftMd });
}

export async function approveReview(jobId: string, title?: string): Promise<void> {
  await apiClient.post(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}/verify`, { title });
}

export async function getRemediationImage(jobId: string, imageName: string): Promise<string> {
  const blob = await apiClient.getBlob(
    `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageName)}`,
  );
  return URL.createObjectURL(blob);
}

export async function getReviewJob(jobId: string) {
  const { data } = await apiClient.get(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
  return remediationJobSchema.parse(data);
}

const flaggedItemSchema = z.object({
  id: z.string(),
  page: z.number(),
  type: z.string(),
  text: z.string(),
  reason: z.string(),
  needs_check: z.boolean(),
});

const diagramSchema = z.object({
  id: z.string(),
  page: z.number(),
  image_name: z.string(),
  alt_text: z.string(),
  status: z.string(),
  needs_check: z.boolean(),
});

const reviewSummarySchema = z.object({
  job_id: z.string(),
  status: z.string(),
  total_pages: z.number(),
  diagrams_described_count: z.number(),
  tables_fixed_count: z.number(),
  flagged_items_count: z.number(),
  diagrams: z.array(diagramSchema),
  tables: z.array(z.record(z.string(), z.unknown())),
  flagged_items: z.array(flaggedItemSchema),
});

export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export async function getReviewSummary(jobId: string): Promise<ReviewSummary> {
  const { data } = await apiClient.get(
    `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/review-summary`,
  );
  return reviewSummarySchema.parse(data);
}

export async function updateReviewContent(id: string, patch: { description?: string }): Promise<void> {
  const parsed = contentUpdateSchema.parse({ id, description: patch.description });
  await apiClient.patch(`/content/${encodeURIComponent(id)}`, parsed);
}
