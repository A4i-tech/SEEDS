import { Alert, Anchor, Group, Stack, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { z } from 'zod';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiState } from '@shared/utils/apiState';
import { selectValue } from '@shared/utils/select';
import { failureSubtitle, type RemediationJob } from '@features/jobs/types/job.types';
import { getRemediationJobs } from '@features/jobs/api/remediationJobs';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { reviewKeys } from '../api/review';

const queueTabSchema = z.enum(['pending', 'approved', 'all']);

type QueueTab = z.infer<typeof queueTabSchema>;

interface QueueRow {
  id: string;
  title: string;
  subtitle: string;
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
  };
}

export function ReviewQueueScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const [tab, setTab] = useState<QueueTab>('pending');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  const queue = useQuery({
    queryKey: reviewKeys.queue,
    queryFn: () => getRemediationJobs(50),
    enabled: status === 'authenticated',
  });
  const queueState = toApiState(queue);
  const jobs = queueState.status === 'done' ? queueState.data : [];
  const pendingCount = jobs.filter((job) => pendingStatuses.has(job.status)).length;

  const q = query.trim().toLowerCase();
  const rows = jobs
    .filter(TAB_FILTER[tab])
    .map(toRow)
    .filter((row) => !q || row.title.toLowerCase().includes(q));

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
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('review.title')}</Title>
      <Text>{t('review.description')}</Text>
      <Group justify="space-between" align="flex-end" gap="md">
        <Tabs value={tab} onChange={(v) => setTab(queueTabSchema.parse(selectValue(v, 'pending')))} miw={0} flex={1}>
          <Tabs.List>
            <Tabs.Tab value="pending">{t('review.tabs.pending', { count: pendingCount })}</Tabs.Tab>
            <Tabs.Tab value="approved">{t('review.tabs.approved')}</Tabs.Tab>
            <Tabs.Tab value="all">{t('review.tabs.all')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <TextInput
          aria-label={t('review.search')}
          placeholder={t('review.search')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={{ base: '100%', sm: 240 }}
        />
      </Group>
      {queueState.status === 'error' && <Alert>{queueState.error.message}</Alert>}
      <DataTable<QueueRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={queueState.status === 'loading'}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('review.empty')}
        actions={(row) => (
          <Anchor
            component="button"
            type="button"
            fw={700}
            onClick={() => void navigate({ to: `/review/text/$jobId`, params: { jobId: row.id } })}
          >
            {t('review.open')}
          </Anchor>
        )}
        actionsLabel={t('review.columns.open')}
      />
    </Stack>
  );
}
