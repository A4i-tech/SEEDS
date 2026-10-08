import { apiClient } from '@shared/services/apiClient';
import { z } from 'zod';
import { remediationJobDetailSchema } from '../types/remediation.types';

const createJobResponseSchema = z.object({ job_id: z.string() });

export async function createRemediationJob(file: File, targetLanguage = '') {
  const body = new FormData();
  body.append('file', file);
  body.append('language', 'auto');
  body.append('target_language', targetLanguage);
  const data = await apiClient.postForm('/textbook-remediation/jobs', body);
  return createJobResponseSchema.parse(data).job_id;
}

export async function getRemediationJob(jobId: string) {
  const { data } = await apiClient.get(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
  return remediationJobDetailSchema.parse(data);
}

export function remediationJobStreamUrl(jobId: string) {
  return `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/stream`;
}

export async function downloadRemediationArtifact(jobId: string, name: string, filename: string) {
  const blob = await apiClient.getBlob(
    `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
