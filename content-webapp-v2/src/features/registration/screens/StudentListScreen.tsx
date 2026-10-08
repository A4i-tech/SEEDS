import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { FormModal } from '../components/FormModal';
import { LoadError } from '@shared/components/LoadError';
import { RowActions } from '../components/RowActions';
import { useStudents } from '../hooks/useStudents';
import { useConfirmRemove } from '../hooks/useConfirmRemove';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { studentCreateSchema, studentUpdateSchema, type Student } from '../types/registration.types';

type StudentFormValues = {
  name: string;
  phone_number: string;
};

const EMPTY_VALUES: StudentFormValues = { name: '', phone_number: '' };

const MODE_CONFIG = {
  create: { title: 'registration.addStudent', schema: studentCreateSchema },
  edit: { title: 'registration.editStudent', schema: studentUpdateSchema },
};

const SORT_VALUES = {
  name: (student: Student) => student.name,
  phone: (student: Student) => student.phone_number,
};

function StudentFormModal({ student, onClose }: { student?: Student; onClose: () => void }) {
  const { t } = useTranslation();
  const { create, update } = useStudents();
  const config = MODE_CONFIG[student ? 'edit' : 'create'];
  const form = useForm<StudentFormValues>({
    initialValues: student ? { name: student.name, phone_number: student.phone_number } : EMPTY_VALUES,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = (values: StudentFormValues) => {
    const options = { onSuccess: onClose };
    if (student) update.mutate({ id: student.id, body: values }, options);
    else create.mutate(values, options);
  };

  return (
    <FormModal
      title={t(config.title)}
      submitLabel={t('registration.save')}
      mutation={student ? update : create}
      onClose={onClose}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
      <TextInput label={t('registration.phone')} required {...form.getInputProps('phone_number')} />
    </FormModal>
  );
}

export function StudentListScreen() {
  const { t } = useTranslation();
  const { state, students, reload, remove } = useStudents();
  const confirmRemove = useConfirmRemove();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure();
  const [editingId, setEditingId] = useState('');
  const editing = students.find((student) => student.id === editingId);

  const rows = useMemo(() => sortRows(students, sort, SORT_VALUES), [students, sort]);

  const columns: DataTableColumn<Student>[] = [
    {
      key: 'name',
      header: t('registration.columns.name'),
      sortable: true,
      render: (row) => <Text fw={700}>{row.name}</Text>,
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
        <Title order={3}>{t('registration.tabs.students')}</Title>
        <Button onClick={openCreate}>{t('registration.addStudent')}</Button>
      </Group>
      {state.status === 'error' && <LoadError error={state.error} onRetry={reload} />}
      <DataTable<Student>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={state.status === 'loading'}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('registration.emptyStudents')}
        actions={(row) => (
          <RowActions
            actions={[
              { label: t('registration.edit'), onClick: () => setEditingId(row.id) },
              {
                label: t('registration.delete'),
                onClick: () =>
                  confirmRemove(t('registration.deleteStudentTitle'), t('registration.delete'), () =>
                    remove.mutateAsync(row.id),
                  ),
              },
            ]}
          />
        )}
        actionsLabel={t('registration.columns.actions')}
      />
      {createOpened && <StudentFormModal onClose={closeCreate} />}
      {editing && <StudentFormModal student={editing} onClose={() => setEditingId('')} />}
    </Stack>
  );
}
