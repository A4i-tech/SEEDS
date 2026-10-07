import { Button, Group, Pagination, Skeleton, Table, Text, UnstyledButton } from '@mantine/core';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

export type SortDirection = 'asc' | 'desc';

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  sort?: { key: string; direction: SortDirection } | null;
  onSortChange?: (key: string) => void;
  page: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  footerLayout?: 'pages' | 'range';
  actions?: (row: T) => ReactNode;
  actionsLabel?: string;
  emptyMessage: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  skeletonRows = 5,
  sort = null,
  onSortChange,
  page,
  pageSize = 10,
  total,
  onPageChange,
  footerLayout = 'pages',
  actions,
  actionsLabel = 'Actions',
  emptyMessage,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const itemCount = total ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const visibleRows = footerLayout === 'range' ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  const rangeStart = itemCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, itemCount);

  return (
    <>
      <Table
        highlightOnHover
        withTableBorder
        aria-busy={loading || undefined}
        className={classes.table}
      >
        <Table.Thead>
          <Table.Tr>
            {columns.map((col) => (
              <Table.Th key={col.key} aria-sort={sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                {col.sortable && onSortChange ? (
                  <UnstyledButton onClick={() => onSortChange(col.key)} aria-label={`Sort by ${col.header}`}>
                    <Group gap={4}>
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={14} aria-hidden />
                        ) : (
                          <ArrowDown size={14} aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown size={14} aria-hidden />
                      )}
                    </Group>
                  </UnstyledButton>
                ) : (
                  col.header
                )}
              </Table.Th>
            ))}
            {actions && <Table.Th>{actionsLabel}</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <Table.Tr key={i}>
                  {columns.map((col) => (
                    <Table.Td key={col.key}>
                      <Skeleton height={16} aria-label="Loading" />
                    </Table.Td>
                  ))}
                  {actions && (
                    <Table.Td>
                      <Skeleton height={16} aria-label="Loading" />
                    </Table.Td>
                  )}
                </Table.Tr>
              ))
            : visibleRows.map((row) => (
                <Table.Tr key={getRowId(row)}>
                  {columns.map((col) => (
                    <Table.Td key={col.key}>{col.render(row)}</Table.Td>
                  ))}
                  {actions && <Table.Td>{actions(row)}</Table.Td>}
                </Table.Tr>
              ))}
          {!loading && visibleRows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={columns.length + (actions ? 1 : 0)}>{emptyMessage}</Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      {footerLayout === 'range' && (
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            {t('common.rangeOf', { start: rangeStart, end: rangeEnd, total: itemCount })}
          </Text>
          {pageCount > 1 && (
            <Group gap="xs">
              <Button variant="subtle" size="xs" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
                {t('common.previous')}
              </Button>
              <Button
                variant="subtle"
                size="xs"
                disabled={page >= pageCount}
                onClick={() => onPageChange?.(page + 1)}
              >
                {t('common.next')}
              </Button>
            </Group>
          )}
        </Group>
      )}
      {footerLayout !== 'range' && pageCount > 1 && (
        <Group justify="flex-end" mt="md">
          <Pagination
            value={page}
            total={pageCount}
            onChange={onPageChange}
            aria-label="Pagination"
            classNames={{ control: classes.paginationControl }}
          />
        </Group>
      )}
    </>
  );
}
