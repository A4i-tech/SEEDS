import { Anchor, Button, Flex, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { LoadError } from '@shared/components/LoadError';
import { selectValue } from '@shared/utils/select';
import { formatRelativeTime } from '@shared/utils/format';
import { JOB_ACTION, flowRoute, type JobRow, type JobStatus, type JobType } from '../types/job.types';
import { useDeleteRemediationJob, useJobs } from '../hooks/useJobs';
import { PageTitle } from '@shared/components/PageTitle';
import { RowActions } from '@shared/components/RowActions';

const typeOptions: Array<'all' | JobType> = ['all', 'make-accessible', 'course-sync', 'localize', 'create'];
const statusOptions: Array<'all' | JobStatus> = ['all', 'failed', 'needs-review', 'needs-attention', 'running', 'done'];

function RowAction({ row }: { row: JobRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const go = () => {
    if (row.status === 'needs-review') return navigate({ to: '/review' });
    if (row.type === 'make-accessible') return navigate({ to: '/make-accessible/$jobId', params: { jobId: row.id } });
    return navigate({ to: flowRoute[row.type] });
  };
  const remove = useDeleteRemediationJob();
  const confirmRemove = () =>
    openConfirmDialog({
      title: t('jobs.deleteTitle'),
      body: t('jobs.deleteBody'),
      confirmLabel: t('jobs.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => remove.mutate(row.id),
    });
  const action = JOB_ACTION[row.status];
  const emphasised = row.status === 'failed' || row.status === 'needs-review';
  return (
    <Group gap="sm" wrap="nowrap">
      {emphasised && (
        <Button variant="outline" size="compact-md" onClick={() => void go()}>
          {t(action.labelKey)}
        </Button>
      )}
      <RowActions>
        {!emphasised && (
          <Anchor component="button" type="button" variant="rowAction" onClick={() => void go()}>
            {t(action.labelKey)}
          </Anchor>
        )}
        {row.type === 'make-accessible' && (
          <Anchor component="button" type="button" variant="rowAction" c="red" onClick={confirmRemove}>
            {t('jobs.delete')}
          </Anchor>
        )}
      </RowActions>
    </Group>
  );
}

export function JobsScreen() {
  const { t } = useTranslation();
  const state = useJobs();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof typeOptions)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>('all');
  const [page, setPage] = useState(1);

  const rows = state.status === 'done' ? state.data : [];
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (typeFilter === 'all' || row.type === typeFilter) &&
      (statusFilter === 'all' || row.status === statusFilter) &&
      (!q || row.title.toLowerCase().includes(q)),
  );

  const columns: DataTableColumn<JobRow>[] = [
    {
      key: 'title',
      header: t('jobs.columns.job'),
      render: (row) => (
        <Stack gap={0}>
          <Text size="sm" variant="rowTitle">
            {row.title}
          </Text>
          {row.subtitle && (
            <Text size="xs" c="dimmed">
              {row.subtitle}
            </Text>
          )}
        </Stack>
      ),
    },
    { key: 'type', header: t('jobs.columns.type'), render: (row) => t(`jobs.types.${row.type}`) },
    {
      key: 'status',
      header: t('jobs.columns.status'),
      render: (row) => <StatusBadge tone={row.status} label={t(`jobs.statuses.${row.status}`)} />,
    },
    {
      key: 'updated',
      header: t('jobs.columns.updated'),
      render: (row) => (
        <Text size="xs" c="dimmed">
          {formatRelativeTime(row.updated)}
        </Text>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <PageTitle title={t('jobs.title')} />
      <Text size="sm" c="dimmed">
        {t('jobs.description')}
      </Text>
      <Flex gap="md" direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'flex-end' }}>
        <Select
          aria-label={t('jobs.columns.type')}
          value={typeFilter}
          onChange={(v) => setTypeFilter(selectValue(v, 'all'))}
          data={typeOptions.map((v) => ({ value: v, label: t(`jobs.typeOptions.${v}`) }))}
        />
        <Select
          aria-label={t('jobs.columns.status')}
          value={statusFilter}
          onChange={(v) => setStatusFilter(selectValue(v, 'all'))}
          data={statusOptions.map((v) => ({ value: v, label: t(`jobs.statusOptions.${v}`) }))}
        />
        <TextInput
          aria-label={t('jobs.search')}
          placeholder={t('jobs.search')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          flex={1}
          miw="min(240px, 100%)"
        />
      </Flex>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <LoadError error={state.error} />}
      <DataTable<JobRow>
        columns={columns}
        rows={filtered}
        getRowId={(row) => `${row.type}:${row.id}`}
        loading={state.status === 'loading'}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('jobs.empty')}
        actions={(row) => <RowAction row={row} />}
        actionsLabel={t('jobs.columns.action')}
      />
    </Stack>
  );
}
