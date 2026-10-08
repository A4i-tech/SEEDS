import { Chip, Group, Stack, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { failureSubtitle, type RemediationJob } from '@features/jobs/types/job.types';
import { getRemediationJobs } from '@features/jobs/api/remediationJobs';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import classes from './ReviewQueueScreen.module.css';

const queueTabSchema = z.enum(['pending', 'approved', 'all']);

type QueueTab = z.infer<typeof queueTabSchema>;

const modalities = ['text', 'audio', 'website'];

interface QueueRow {
  id: string;
  title: string;
  subtitle: string;
  modality: string;
  kind: string;
  from: string;
}

const pendingStatuses = new Set(['ready_to_review', 'in_review']);

const TAB_FILTER: Record<QueueTab, (job: RemediationJob) => boolean> = {
  pending: (job) => pendingStatuses.has(job.status),
  approved: (job) => job.status === 'verified',
  all: (job) => pendingStatuses.has(job.status) || job.status === 'verified',
};

function toRow(job: RemediationJob): QueueRow {
  return {
    id: job.job_id,
    title: job.source_name,
    subtitle: failureSubtitle(job),
    modality: 'text',
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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const queue = useQuery({
    queryKey: ['review', 'queue'],
    queryFn: () => getRemediationJobs(50),
    enabled: status === 'authenticated',
  });
  const loadError = toApiErrorMessage(queue.error);

  const { data: jobs = [] } = queue;
  const pendingCount = jobs.filter((job) => pendingStatuses.has(job.status)).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter(TAB_FILTER[tab])
      .map(toRow)
      .filter(
        (row) =>
          (selected.length === 0 || selected.includes(row.modality)) && (!q || row.title.toLowerCase().includes(q)),
      );
  }, [jobs, tab, selected, query]);

  const columns: DataTableColumn<QueueRow>[] = [
    {
      key: 'item',
      header: t('review.columns.item'),
      render: (row) => (
        <Stack gap={0}>
          <Text size="sm" fw={700}>{row.title}</Text>
          {row.subtitle && (
            <Text size="xs" c="dimmed">
              {row.subtitle}
            </Text>
          )}
        </Stack>
      ),
    },
    { key: 'modality', header: t('review.columns.modality'), render: (row) => t(`review.modalities.${row.modality}`) },
    { key: 'kind', header: t('review.columns.kind'), render: (row) => row.kind },
    { key: 'from', header: t('review.columns.from'), render: (row) => row.from },
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('review.title')}</Title>
      <Text>{t('review.description')}</Text>
      <Group justify="space-between" align="flex-end" gap="md" className={classes.toolbar}>
        <Tabs value={tab} onChange={(v) => setTab(queueTabSchema.parse(selectValue(v, 'pending')))} className={classes.tabs}>
          <Tabs.List className={classes.tabList}>
            <Tabs.Tab value="pending" className={classes.tab}>
              {t('review.tabs.pending', { count: pendingCount })}
            </Tabs.Tab>
            <Tabs.Tab value="approved" className={classes.tab}>{t('review.tabs.approved')}</Tabs.Tab>
            <Tabs.Tab value="all" className={classes.tab}>{t('review.tabs.all')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <TextInput
          aria-label={t('review.search')}
          placeholder={t('review.search')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className={classes.search}
        />
      </Group>
      <Text className={classes.eyebrow}>{t('review.modality')}</Text>
      <Chip.Group multiple value={selected} onChange={setSelected}>
        <Group gap="xs" aria-label={t('review.modality')}>
          {modalities.map((m) => (
            <Chip key={m} value={m} classNames={{ label: classes.chip, iconWrapper: classes.chipIcon }}>
              {t(`review.modalities.${m}`)}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      <Text size="sm" c="dimmed">
        {t('review.modalityNote')}
      </Text>
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
