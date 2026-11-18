import { LONG_TIMEOUT_MS, apiClient } from '@shared/services/apiClient';
import { z } from 'zod';
import { remediationJobDetailSchema } from '../types/remediation.types';

const createJobResponseSchema = z.object({ job_id: z.string() });

export async function createRemediationJob(file: File, targetLanguage = '') {
  const body = new FormData();
  body.append('file', file);
  body.append('language', 'auto');
  body.append('target_language', targetLanguage);
  const data = await apiClient.postForm('/textbook-remediation/jobs', body, { timeoutMs: LONG_TIMEOUT_MS });
  return createJobResponseSchema.parse(data).job_id;
}

const createBookResponseSchema = z.object({ book_id: z.string(), job_ids: z.array(z.string()) });

export async function createBook(files: File[], title: string, targetLanguage = '') {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  body.append('title', title);
  body.append('language', 'auto');
  body.append('target_language', targetLanguage);
  const data = await apiClient.postForm('/textbook-remediation/books', body, { timeoutMs: LONG_TIMEOUT_MS });
  return createBookResponseSchema.parse(data);
}

export async function getRemediationJob(jobId: string) {
  const { data } = await apiClient.get(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
  return remediationJobDetailSchema.parse(data);
}

export function remediationJobStreamUrl(jobId: string) {
  return `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/stream`;
}
