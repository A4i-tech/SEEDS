import { Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { formatRelativeTime } from '@shared/utils/format';
import type { JobRow, JobStatus, JobType } from '../types/job.types';
import { useJobs } from '../hooks/useJobs';
import classes from './JobsScreen.module.css';

const typeOptions: Array<'all' | JobType> = ['all', 'make-accessible', 'course-sync', 'localize', 'create'];
const statusOptions: Array<'all' | JobStatus> = ['all', 'failed', 'needs-review', 'running', 'done'];

const flowRoute: Record<JobType, string> = {
  'make-accessible': routePaths.makeAccessible,
  'course-sync': routePaths.library,
  localize: routePaths.localize,
  create: routePaths.create,
};

function rowTarget(row: JobRow): string {
  if (row.type === 'make-accessible') return `${flowRoute[row.type]}/${row.id}`;
  return flowRoute[row.type];
}

function RowAction({ row }: { row: JobRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const target = rowTarget(row);
  const go = () =>
    row.type === 'make-accessible'
      ? navigate({ to: '/make-accessible/$jobId', params: { jobId: row.id } })
      : navigate({ to: target });
  if (row.status === 'failed') {
    return (
      <Button variant="outline" size="sm" className={classes.outlineAction} onClick={() => void go()}>
        {t('jobs.fix')}
      </Button>
    );
  }
  if (row.status === 'needs-review') {
    return (
      <Button variant="outline" size="sm" className={classes.outlineAction} onClick={() => void go()}>
        {t('jobs.continue')}
      </Button>
    );
  }
  if (row.type === 'create') {
    return (
      <Button variant="transparent" size="sm" className={classes.textAction} onClick={() => void go()}>
        {t('jobs.open')}
      </Button>
    );
  }
  return (
    <Button variant="transparent" size="sm" className={classes.textAction} onClick={() => void go()}>
      {t('jobs.view')}
    </Button>
  );
}

export function JobsScreen() {
  const { t } = useTranslation();
  const { rows, isLoading, error } = useJobs();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof typeOptions)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>('all');
  const [page, setPage] = useState(1);
  const loadError = toApiErrorMessage(error);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (typeFilter === 'all' || row.type === typeFilter) &&
        (statusFilter === 'all' || row.status === statusFilter) &&
        (!q || row.title.toLowerCase().includes(q)),
    );
  }, [rows, query, typeFilter, statusFilter]);

  const columns: DataTableColumn<JobRow>[] = [
    {
      key: 'title',
      header: t('jobs.columns.job'),
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
    { key: 'type', header: t('jobs.columns.type'), render: (row) => t(`jobs.types.${row.type}`) },
    {
      key: 'status',
      header: t('jobs.columns.status'),
      render: (row) => <StatusBadge tone={row.status} label={t(`jobs.statuses.${row.status}`)} />,
    },
    {
      key: 'updated',
      header: t('jobs.columns.updated'),
      render: (row) => formatRelativeTime(row.updated),
    },
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('jobs.title')}</Title>
      <Text c="dimmed">{t('jobs.description')}</Text>
      <Group gap="md" className={classes.filters}>
        <Select
          aria-label={t('jobs.columns.type')}
          value={typeFilter}
          onChange={(v) => setTypeFilter((v as typeof typeFilter) ?? 'all')}
          data={typeOptions.map((v) => ({ value: v, label: t(`jobs.typeOptions.${v}`) }))}
        />
        <Select
          aria-label={t('jobs.columns.status')}
          value={statusFilter}
          onChange={(v) => setStatusFilter((v as typeof statusFilter) ?? 'all')}
          data={statusOptions.map((v) => ({ value: v, label: t(`jobs.statusOptions.${v}`) }))}
        />
        <TextInput
          aria-label={t('jobs.search')}
          placeholder={t('jobs.search')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className={classes.search}
        />
      </Group>
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      <DataTable<JobRow>
        columns={columns}
        rows={filtered}
        getRowId={(row) => `${row.type}:${row.id}`}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        footerLayout="range"
        emptyMessage={t('jobs.empty')}
        actions={(row) => <RowAction row={row} />}
        actionsLabel={t('jobs.columns.action')}
      />
    </Stack>
  );
}
