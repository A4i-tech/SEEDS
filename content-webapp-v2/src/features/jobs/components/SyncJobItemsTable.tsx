import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { SyncJobItem } from '../api/syncJobs';
import { useSyncJobItems } from '../hooks/useSyncJobItems';
import classes from '../screens/JobDetailScreen.module.css';

export function SyncJobItemsTable({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const items = useSyncJobItems(jobId, expanded);
  const rows = (items.data?.pages ?? []).flatMap((page) => page.items);
  const loadError = toApiErrorMessage(items.error);

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
        className={classes.secondaryButton}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? t('jobs.detail.hideItems') : t('jobs.detail.showItems')}
      </Button>
      {expanded && (
        <>
          {items.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
          {loadError && (
            <Text c="red" role="alert">
              {loadError}
            </Text>
          )}
          {items.isSuccess && rows.length === 0 && <Text c="dimmed">{t('jobs.detail.emptyItems')}</Text>}
          {items.isSuccess && rows.length > 0 && (
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
              className={classes.moreButton}
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
