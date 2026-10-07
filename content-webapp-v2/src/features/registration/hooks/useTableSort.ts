import { useState } from 'react';
import type { SortDirection } from '@shared/components/DataTable';

export function useTableSort() {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key && current.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' },
    );
  };

  return { sort, toggleSort };
}
