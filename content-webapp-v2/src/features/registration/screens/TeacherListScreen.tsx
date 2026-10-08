import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { LoadError } from '@shared/components/LoadError';
import { RowActions } from '../components/RowActions';
import { TeacherFormModal } from '../components/TeacherFormModal';
import { TransferModal } from '../components/TeacherTransferModal';
import { useConfirmRemove } from '../hooks/useConfirmRemove';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { useTeachers } from '../hooks/useTeachers';
import type { SchoolTeacher } from '../types/registration.types';

const SORT_VALUES = {
  name: (teacher: SchoolTeacher) => teacher.name,
  phone: (teacher: SchoolTeacher) => teacher.phone_number,
};

export function TeacherListScreen() {
  const { t } = useTranslation();
  const { teachers, isLoading, error, reload, remove } = useTeachers();
  const confirmRemove = useConfirmRemove();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [registerOpened, { open: openRegister, close: closeRegister }] = useDisclosure();
  const [editingId, setEditingId] = useState('');
  const [transferringId, setTransferringId] = useState('');
  const editing = teachers.find((teacher) => teacher.id === editingId);
  const transferringTeacher = teachers.find((teacher) => teacher.id === transferringId);

  const rows = useMemo(() => sortRows(teachers, sort, SORT_VALUES), [teachers, sort]);

  const columns: DataTableColumn<SchoolTeacher>[] = [
    {
      key: 'name',
      header: t('registration.columns.name'),
      sortable: true,
      render: (row) => (
        <Stack gap={0}>
          <Text fw={700}>{row.name}</Text>
          <Text size="sm" c="dimmed">
            {t(`registration.roles.${row.role}`)}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'phone',
      header: t('registration.columns.phone'),
      sortable: true,
      render: (row) => row.phone_number,
    },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>{t('registration.tabs.teachers')}</Title>
        <Button onClick={openRegister}>{t('registration.addTeacher')}</Button>
      </Group>
      <LoadError error={error} onRetry={reload} />
      <DataTable<SchoolTeacher>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('registration.emptyTeachers')}
        actions={(row) => (
          <RowActions
            actions={[
              { label: t('registration.edit'), onClick: () => setEditingId(row.id) },
              { label: t('registration.transfer'), onClick: () => setTransferringId(row.id) },
              {
                label: t('registration.remove'),
                onClick: () =>
                  confirmRemove(t('registration.deleteTeacherTitle'), t('registration.remove'), () =>
                    remove.mutateAsync(row.id),
                  ),
              },
            ]}
          />
        )}
        actionsLabel={t('registration.columns.actions')}
      />
      {registerOpened && <TeacherFormModal onClose={closeRegister} />}
      {editing && <TeacherFormModal teacher={editing} onClose={() => setEditingId('')} />}
      {transferringTeacher && (
        <TransferModal teacher={transferringTeacher} onClose={() => setTransferringId('')} />
      )}
    </Stack>
  );
}
