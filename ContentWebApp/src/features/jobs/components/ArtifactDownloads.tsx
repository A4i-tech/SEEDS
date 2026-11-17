import { Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useDownloadArtifact } from '../hooks/useDownloadArtifact';
import type { RemediationJob } from '../types/job.types';
import { availableDownloads } from '../utils/artifacts';

export function ArtifactDownloads({ job }: { job: Pick<RemediationJob, 'job_id' | 'source_name' | 'artifacts'> }) {
  const { t } = useTranslation();
  const download = useDownloadArtifact(job);
  return (
    <Group gap="md">
      {availableDownloads(job.artifacts).map((entry) => (
        <Button
          key={entry.key}
          variant="outline"
          loading={download.isPending && download.variables?.key === entry.key}
          onClick={() => download.mutate(entry)}
        >
          {t(`makeAccessible.downloads.${entry.key}`)}
        </Button>
      ))}
    </Group>
  );
}
