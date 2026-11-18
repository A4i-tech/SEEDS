import { Flex, Select, Stack, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { LoadError } from '@shared/components/LoadError';
import { useRole } from '@features/auth/store/useAuthStore';
import { useVolunteers } from '@features/registration/hooks/useVolunteers';
import { BookActions } from '../components/BookActions';
import { BookStageCell, BookTitleCell, ChapterTitleCell } from '../components/BookCells';
import { JobRowAction } from '../components/JobRowAction';
import { StageProgress } from '../components/StageProgress';
import { buildRows, type JobsTableRow } from '../utils/bookRows';
import { selectValue } from '@shared/utils/select';
import { formatRelativeTime } from '@shared/utils/format';
import type { JobRow, JobStatus, JobType } from '../types/job.types';
import { useJobs } from '../hooks/useJobs';
import { PageTitle } from '@shared/components/PageTitle';
import { volunteerRole } from '@shared/utils/jwt';

const typeOptions: Array<'all' | JobType> = ['all', 'make-accessible', 'course-sync', 'localize', 'create'];
const statusOptions: Array<'all' | JobStatus> = ['all', 'failed', 'needs-review', 'needs-attention', 'running', 'done'];

const PAGE_SIZE = 10;

function JobTitle({ job }: { job: JobRow }) {
  return (
    <Stack gap={0}>
      <Text size="sm" variant="rowTitle">
        {job.title}
      </Text>
      {job.subtitle && (
        <Text size="xs" c="dimmed">
          {job.subtitle}
        </Text>
      )}
    </Stack>
  );
}

export function JobsScreen() {
  const { t } = useTranslation();
  const state = useJobs();
  const role = useRole();
  const { volunteers } = useVolunteers(role === 'tenant');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof typeOptions)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>('all');
  const [page, setPage] = useState(1);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (bookId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(bookId)) next.add(bookId);
      return next;
    });

  const tableRows =
    state.status === 'done'
      ? buildRows(state.data, state.books, expanded, { query, type: typeFilter, status: statusFilter }, role === volunteerRole)
      : [];

  const columns: DataTableColumn<JobsTableRow>[] = [
    {
      key: 'title',
      header: t('jobs.columns.job'),
      render: (row) => {
        if (row.kind === 'book') {
          if (row.readOnly) return <Text size="sm" variant="rowTitle">{t('jobs.book.volunteerHeading', { title: row.book.title })}</Text>;
          return <BookTitleCell row={row} onToggle={() => toggle(row.book.book_id)} />;
        }
        const title = <JobTitle job={row.job} />;
        return row.kind === 'chapter' ? <ChapterTitleCell position={row.position}>{title}</ChapterTitleCell> : title;
      },
    },
    {
      key: 'type',
      header: t('jobs.columns.type'),
      render: (row) => {
        if (row.kind === 'book') return row.readOnly ? null : t('jobs.types.make-accessible');
        return t(`jobs.types.${row.job.type}`);
      },
    },
    {
      key: 'stage',
      header: t('jobs.columns.stage'),
      render: (row) => {
        if (row.kind === 'book') return row.readOnly ? null : <BookStageCell row={row} />;
        return row.job.remediation ? <StageProgress job={row.job.remediation} /> : null;
      },
    },
    ...(role === 'tenant'
      ? [
          {
            key: 'assignee',
            header: t('jobs.columns.assignee'),
            render: (row: JobsTableRow) => {
              if (row.kind === 'book' || !row.job.remediation) return null;
              const id = row.job.remediation.assigned_to;
              if (!id) return <Text size="sm" c="dimmed">{t('jobs.unassigned')}</Text>;
              return new Map(volunteers.map((v) => [v.id, v.name])).get(id);
            },
          },
        ]
      : []),
    {
      key: 'status',
      header: t('jobs.columns.status'),
      render: (row) => {
        if (row.kind === 'book' && row.readOnly) return null;
        const status = row.kind === 'book' ? row.status : row.job.status;
        return <StatusBadge tone={status} label={t(`jobs.statuses.${status}`)} />;
      },
    },
    {
      key: 'updated',
      header: t('jobs.columns.updated'),
      render: (row) => {
        if (row.kind === 'book' && row.readOnly) return null;
        return (
          <Text size="xs" c="dimmed">
            {formatRelativeTime(row.kind === 'book' ? row.updated : row.job.updated)}
          </Text>
        );
      },
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
          onChange={(v) => { setTypeFilter(selectValue(v, 'all')); setPage(1); }}
          data={typeOptions.map((v) => ({ value: v, label: t(`jobs.typeOptions.${v}`) }))}
        />
        <Select
          aria-label={t('jobs.columns.status')}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(selectValue(v, 'all')); setPage(1); }}
          data={statusOptions.map((v) => ({ value: v, label: t(`jobs.statusOptions.${v}`) }))}
        />
        <TextInput
          aria-label={t('jobs.search')}
          placeholder={t('jobs.search')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => { setQuery(e.currentTarget.value); setPage(1); }}
          flex={1}
          miw="min(240px, 100%)"
        />
      </Flex>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <LoadError error={state.error} />}
      <DataTable<JobsTableRow>
        columns={columns}
        rows={tableRows}
        getRowId={(row) => row.id}
        loading={state.status === 'loading'}
        page={Math.min(page, Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE)))}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        emptyMessage={t('jobs.empty')}
        actions={(row) => {
          if (row.kind !== 'book') return <JobRowAction row={row.job} />;
          return row.readOnly ? null : <BookActions row={row} />;
        }}
        actionsLabel={t('jobs.columns.action')}
      />
    </Stack>
  );
}
