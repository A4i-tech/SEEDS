import { useMutation } from '@tanstack/react-query';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { downloadRemediationArtifact } from '../api/remediationJobs';
import { artifactFilename, type ArtifactDownload } from '../utils/artifacts';

export function useDownloadArtifact(job: { job_id: string; source_name: string }) {
  return useMutation({
    mutationFn: (entry: ArtifactDownload) =>
      downloadRemediationArtifact(job.job_id, entry.key, artifactFilename(job.source_name, entry)),
    onError: notifyApiError,
  });
}
