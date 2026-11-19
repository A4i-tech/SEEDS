import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { saveBlob } from '@shared/utils/saveBlob';
import { bookSchema, remediationJobSchema } from '../types/job.types';

const jobsResponseSchema = z.object({ jobs: z.array(remediationJobSchema), books: z.array(bookSchema) });

export async function getRemediationJobsAndBooks(limit: number) {
  const { data } = await apiClient.get('/textbook-remediation/jobs', { params: { limit } });
  return jobsResponseSchema.parse(data);
}

export async function getRemediationJobs(limit: number) {
  return (await getRemediationJobsAndBooks(limit)).jobs;
}

export async function deleteRemediationJob(jobId: string) {
  await apiClient.delete(`/textbook-remediation/jobs/${encodeURIComponent(jobId)}`);
}

export async function assignRemediationJob(body: { jobId: string; volunteerId: string; force: boolean }) {
  await apiClient.put(`/textbook-remediation/jobs/${encodeURIComponent(body.jobId)}/assignment`, {
    volunteer_id: body.volunteerId,
    force: body.force,
  });
}

export async function downloadRemediationArtifact(jobId: string, name: string, filename: string) {
  const blob = await apiClient.getBlob(
    `/textbook-remediation/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`,
  );
  saveBlob(blob, filename);
}
