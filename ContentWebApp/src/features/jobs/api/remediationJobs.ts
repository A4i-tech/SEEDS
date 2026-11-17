import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { remediationJobSchema } from '../types/job.types';

const jobsResponseSchema = z.object({ jobs: z.array(remediationJobSchema) });

export async function getRemediationJobs(limit: number) {
  const { data } = await apiClient.get('/textbook-remediation/jobs', { params: { limit } });
  return jobsResponseSchema.parse(data).jobs;
}

export async function deleteRemediationJob(jobId: string) {
  await apiClient.delete(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
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
