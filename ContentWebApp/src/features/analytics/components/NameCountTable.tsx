import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';

export interface NameCountRow {
  label: string;
  count: number;
}

export function NameCountTable({ rows }: { rows: NameCountRow[] }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const columns: DataTableColumn<NameCountRow>[] = [
    { key: 'label', header: t('analytics.expanded.item'), render: (row) => row.label },
    { key: 'count', header: t('analytics.expanded.calls'), render: (row) => String(row.count) },
  ];

  return (
    <DataTable<NameCountRow>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.label}
      loading={false}
      page={page}
      pageSize={10}
      onPageChange={setPage}
      emptyMessage={t('analytics.noData')}
    />
  );
}
