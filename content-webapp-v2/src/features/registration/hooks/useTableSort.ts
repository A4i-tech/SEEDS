import { useState } from 'react';
import type { SortDirection } from '@shared/components/DataTable';

type Sort = { key: string; direction: SortDirection };

const UNSORTED: Sort = { key: '', direction: 'asc' };

const DIRECTION_SIGN: Record<SortDirection, number> = { asc: 1, desc: -1 };

function nextSort(current: Sort, key: string): Sort {
  if (current.key === key && current.direction === 'asc') return { key, direction: 'desc' };
  return { key, direction: 'asc' };
}

export function sortRows<T>(rows: T[], sort: Sort, sortValues: Record<string, (row: T) => string>): T[] {
  if (!sort.key) return rows;
  const sign = DIRECTION_SIGN[sort.direction];
  const valueOf = sortValues[sort.key];
  return [...rows].sort((a, b) => sign * valueOf(a).localeCompare(valueOf(b)));
}

export function useTableSort() {
  const [sort, setSort] = useState(UNSORTED);
  const toggleSort = (key: string) => setSort((current) => nextSort(current, key));
  return { sort, toggleSort };
}
