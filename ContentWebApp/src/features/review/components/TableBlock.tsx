import { Table, Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { buildTable, type TableData } from '../utils/tableBlocks';

export function TableBlock({ table, onChange }: { table: TableData; onChange: (markdown: string) => void }) {
  const { t } = useTranslation();
  const commit = (next: TableData) => onChange(buildTable(next));
  const field = (value: string, label: string, save: (text: string) => void) => (
    <Textarea
      aria-label={label}
      autosize
      minRows={1}
      defaultValue={value}
      onBlur={(e) => {
        if (e.currentTarget.value !== value) save(e.currentTarget.value);
      }}
    />
  );

  return (
    <Table withTableBorder withColumnBorders>
      <Table.Thead>
        <Table.Tr>
          {table.header.map((cell, column) => (
            <Table.Th key={column}>
              {field(cell, t('review.tableHeader', { column: column + 1 }), (text) =>
                commit({ ...table, header: table.header.map((h, i) => (i === column ? text : h)) }),
              )}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {table.rows.map((row, r) => (
          <Table.Tr key={r}>
            {row.map((cell, column) => (
              <Table.Td key={column}>
                {field(cell, t('review.tableCell', { row: r + 1, column: column + 1 }), (text) =>
                  commit({
                    ...table,
                    rows: table.rows.map((current, i) => (i === r ? current.map((c, j) => (j === column ? text : c)) : current)),
                  }),
                )}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
