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

const ARIA_SORT = { none: undefined, asc: 'ascending', desc: 'descending' } as const;
const SORT_ICON = { none: ArrowUpDown, asc: ArrowUp, desc: ArrowDown };

interface DataTableBaseProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  sort?: { key: string; direction: SortDirection };
  onSortChange?: (key: string) => void;
  page: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  footerLayout?: 'pages' | 'range';
  emptyMessage: string;
}

type DataTableActions<T> =
  | { actions?: undefined; actionsLabel?: undefined }
  | { actions: (row: T) => ReactNode; actionsLabel: string };

type DataTableProps<T> = DataTableBaseProps<T> & DataTableActions<T>;

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  sort = { key: '', direction: 'asc' },
  onSortChange,
  page,
  pageSize,
  onPageChange,
  footerLayout = 'range',
  actions,
  actionsLabel,
  emptyMessage,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const itemCount = rows.length;
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const rangeStart = itemCount && (page - 1) * pageSize + 1;
  const columnCount = columns.length + Number(!!actions);
  const sortState = (key: string) => {
    if (sort.key !== key) return 'none';
    return sort.direction;
  };
  const rangeEnd = Math.min(page * pageSize, itemCount);

  return (
    <>
      <Table.ScrollContainer minWidth={600}>
        <Table
          highlightOnHover
          withTableBorder
          withRowBorders={false}
          aria-busy={loading || undefined}
          className={classes.table}
        >
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => {
                const state = sortState(col.key);
                const SortIcon = SORT_ICON[state];
                const isSortable = col.sortable && onSortChange;
                return (
                  <Table.Th key={col.key} aria-sort={ARIA_SORT[state]}>
                    {isSortable && (
                      <UnstyledButton onClick={() => onSortChange(col.key)} aria-label={`Sort by ${col.header}`}>
                        <Group gap={4}>
                          {col.header}
                          <SortIcon size={14} aria-hidden />
                        </Group>
                      </UnstyledButton>
                    )}
                    {!isSortable && col.header}
                  </Table.Th>
                );
              })}
              {actions && <Table.Th>{actionsLabel}</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading &&
              Array.from({ length: 5 }, (_, i) => (
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
              ))}
            {!loading &&
              visibleRows.map((row) => (
                <Table.Tr key={getRowId(row)}>
                  {columns.map((col) => (
                    <Table.Td key={col.key}>{col.render(row)}</Table.Td>
                  ))}
                  {actions && <Table.Td>{actions(row)}</Table.Td>}
                </Table.Tr>
              ))}
            {!loading && visibleRows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columnCount}>{emptyMessage}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Group justify="space-between" mt="md">
        <Text size="sm" c="dimmed">
          {t('common.rangeOf', { start: rangeStart, end: rangeEnd, total: itemCount })}
        </Text>
        {pageCount > 1 && onPageChange &&
          (footerLayout === 'range' ? (
            <Group gap="xs">
              <Button variant="subtle" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
                {t('common.previous')}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => onPageChange?.(page + 1)}
              >
                {t('common.next')}
              </Button>
            </Group>
          ) : (
            <Pagination
              value={page}
              total={pageCount}
              onChange={onPageChange}
              aria-label="Pagination"
              previousIcon={() => t('common.previous')}
              nextIcon={() => t('common.next')}
              size={44}
              radius={4}
              classNames={{ control: classes.paginationControl }}
            />
          ))}
      </Group>
    </>
  );
}
