import { Button, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { LoadError } from '@shared/components/LoadError';
import { toApiState } from '@shared/utils/apiState';
import type { SyncJobItem } from '../api/syncJobs';
import { useSyncJobItems } from '../hooks/useSyncJobItems';

export function SyncJobItemsTable({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const [expanded, { toggle }] = useDisclosure(false);
  const items = useSyncJobItems(jobId, expanded);
  const state = toApiState(items);
  const rows = state.status === 'done' ? state.data.pages.flatMap((page) => page.items) : [];

  const columns: DataTableColumn<SyncJobItem>[] = [
    { key: 'course', header: t('jobs.detail.columns.course'), render: (row) => row.source_id },
    { key: 'name', header: t('jobs.detail.columns.name'), render: (row) => row.name },
    {
      key: 'status',
      header: t('jobs.detail.columns.status'),
      render: (row) => t(`jobs.detail.itemStatuses.${row.status}`),
    },
    {
      key: 'error',
      header: t('jobs.detail.columns.error'),
      render: (row) => (row.error ? <Text c="red">{row.error}</Text> : <Text c="dimmed">—</Text>),
    },
    { key: 'at', header: t('jobs.detail.columns.at'), render: (row) => new Date(row.at).toLocaleString() },
  ];

  return (
    <Stack gap="sm">
      <Button
        variant="outline"
        size="sm"
        w="fit-content"
        onClick={toggle}
        aria-expanded={expanded}
      >
        {expanded ? t('jobs.detail.hideItems') : t('jobs.detail.showItems')}
      </Button>
      {expanded && (
        <>
          {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
          {state.status === 'error' && <LoadError error={state.error} />}
          {state.status === 'done' && rows.length === 0 && <Text c="dimmed">{t('jobs.detail.emptyItems')}</Text>}
          {state.status === 'done' && rows.length > 0 && (
            <DataTable<SyncJobItem>
              columns={columns}
              rows={rows}
              getRowId={(row) => row.source_id}
              loading={items.isFetching}
              page={1}
              pageSize={Math.max(rows.length, 1)}
              emptyMessage={t('jobs.detail.emptyItems')}
            />
          )}
          {items.hasNextPage && (
            <Button
              variant="subtle"
              size="sm"
              w="fit-content"
              disabled={items.isFetchingNextPage}
              onClick={() => void items.fetchNextPage()}
            >
              {items.isFetchingNextPage ? t('jobs.detail.loadingMore') : t('jobs.detail.loadMore')}
            </Button>
          )}
        </>
      )}
    </Stack>
  );
}
