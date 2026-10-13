import { useState } from 'react';
import type { SortDirection } from '@shared/components/DataTable';

type Sort = { key: string; direction: SortDirection };

export function sortRows<T>(rows: T[], sort: Sort, sortValues: Record<string, (row: T) => string>): T[] {
  if (!sort.key || !sortValues[sort.key]) return rows;
  const sign = sort.direction === 'asc' ? 1 : -1;
  const valueOf = sortValues[sort.key];
  return rows.toSorted((a, b) => sign * valueOf(a).localeCompare(valueOf(b)));
}

export function useTableSort() {
  const [sort, setSort] = useState<Sort>({ key: '', direction: 'asc' });
  const toggleSort = (key: string) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  return { sort, toggleSort };
}
