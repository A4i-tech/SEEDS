import { Anchor, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useDownloadArtifact } from '../hooks/useDownloadArtifact';
import type { RemediationJob } from '../types/job.types';
import { availableDownloads } from '../utils/artifacts';

export function RowDownloadMenu({ job }: { job: Pick<RemediationJob, 'job_id' | 'source_name' | 'artifacts'> }) {
  const { t } = useTranslation();
  const download = useDownloadArtifact(job);
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Anchor component="button" type="button" variant="rowAction">
          {t('jobs.download')}
        </Anchor>
      </Menu.Target>
      <Menu.Dropdown>
        {availableDownloads(job.artifacts).map((entry) => (
          <Menu.Item key={entry.key} onClick={() => download.mutate(entry)}>
            {t(`makeAccessible.downloads.${entry.key}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
