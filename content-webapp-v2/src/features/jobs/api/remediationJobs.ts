import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { remediationJobSchema } from '../types/job.types';

const jobsResponseSchema = z.object({ jobs: z.array(remediationJobSchema) });

export async function getRemediationJobs(limit = 20) {
  const { data } = await apiClient.get('/textbook-remediation/jobs', { params: { limit } });
  return jobsResponseSchema.parse(data).jobs;
}

export async function deleteRemediationJob(jobId: string) {
  await apiClient.delete(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
}
