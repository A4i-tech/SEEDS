import { Anchor, Button, Menu } from '@mantine/core';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDownloadArtifact } from '@features/jobs/hooks/useDownloadArtifact';
import type { RemediationJob } from '@features/jobs/types/job.types';
import { availableDownloads } from '@features/jobs/utils/artifacts';

export function DownloadMenu({
  job,
  row = false,
}: {
  job: Pick<RemediationJob, 'job_id' | 'source_name' | 'artifacts'>;
  row?: boolean;
}) {
  const { t } = useTranslation();
  const download = useDownloadArtifact(job);
  const entries = availableDownloads(job.artifacts);
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        {row ? (
          <Anchor component="button" type="button" variant="rowAction">
            {t('jobs.download')}
          </Anchor>
        ) : (
          <Button variant="outline" rightSection={<ChevronDown size={16} aria-hidden />} loading={download.isPending}>
            {t('jobs.download')}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        {entries.length > 1 && (
          <Menu.Item onClick={() => entries.forEach((entry) => download.mutate(entry))}>
            {t('jobs.downloadAll')}
          </Menu.Item>
        )}
        {entries.map((entry) => (
          <Menu.Item key={entry.key} onClick={() => download.mutate(entry)}>
            {t(`makeAccessible.downloads.${entry.key}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
