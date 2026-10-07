import { Chip, Group, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { RemediationJob } from '@features/jobs/types/job.types';
import { getRemediationJobs } from '@features/jobs/api/remediationJobs';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import classes from './ReviewQueueScreen.module.css';

type QueueTab = 'pending' | 'approved' | 'all';

interface QueueRow {
  id: string;
  title: string;
  subtitle: string;
  modality: string;
  kind: string;
  from: string;
}

const pendingStatuses = new Set(['ready_to_review', 'in_review']);

function toRow(job: RemediationJob): QueueRow {
  return {
    id: job.job_id,
    title: job.source_name,
    subtitle: job.status === 'failed' && job.error ? job.error : '',
    modality: 'Text',
    kind: '—',
    from: 'Make accessible',
  };
}

export function ReviewQueueScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const [tab, setTab] = useState<QueueTab>('pending');
  const [page, setPage] = useState(1);

  const queue = useQuery({
    queryKey: ['review', 'queue'],
    queryFn: () => getRemediationJobs(50),
    enabled: status === 'authenticated',
  });
  const loadError = toApiErrorMessage(queue.error);

  const rows = useMemo(() => {
    const jobs = queue.data ?? [];
    const filtered =
      tab === 'pending'
        ? jobs.filter((job) => pendingStatuses.has(job.status))
        : tab === 'approved'
          ? jobs.filter((job) => job.status === 'verified')
          : jobs.filter((job) => pendingStatuses.has(job.status) || job.status === 'verified');
    return filtered.map(toRow);
  }, [queue.data, tab]);

  const columns: DataTableColumn<QueueRow>[] = [
    {
      key: 'item',
      header: t('review.columns.item'),
      render: (row) => (
        <Stack gap={0}>
          <Text fw={700}>{row.title}</Text>
          {row.subtitle && (
            <Text size="sm" c="dimmed">
              {row.subtitle}
            </Text>
          )}
        </Stack>
      ),
    },
    { key: 'modality', header: t('review.columns.modality'), render: (row) => row.modality },
    { key: 'kind', header: t('review.columns.kind'), render: (row) => row.kind },
    { key: 'from', header: t('review.columns.from'), render: (row) => row.from },
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('review.title')}</Title>
      <Text c="dimmed">{t('review.description')}</Text>
      <Tabs value={tab} onChange={(v) => setTab((v as QueueTab) ?? 'pending')}>
        <Tabs.List>
          <Tabs.Tab value="pending">{t('review.tabs.pending')}</Tabs.Tab>
          <Tabs.Tab value="approved">{t('review.tabs.approved')}</Tabs.Tab>
          <Tabs.Tab value="all">{t('review.tabs.all')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Group gap="xs" aria-label={t('review.modality')}>
        <Chip checked readOnly>
          {t('review.modalities.text')}
        </Chip>
      </Group>
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      <DataTable<QueueRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={queue.isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        footerLayout="range"
        emptyMessage={t('review.empty')}
        actions={(row) => (
          <button
            type="button"
            className={classes.openAction}
            onClick={() => void navigate({ to: `${routePaths.review}/text/$jobId`, params: { jobId: row.id } })}
          >
            {t('review.open')}
          </button>
        )}
        actionsLabel={t('review.columns.open')}
      />
    </Stack>
  );
}
