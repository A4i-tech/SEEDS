import { Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useStudents } from '../hooks/useStudents';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { studentCreateSchema, studentUpdateSchema, type Student } from '../types/registration.types';
import classes from './StudentListScreen.module.css';
import { notifyApiError } from '@shared/utils/notifyApiError';

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

function StudentFormModal({
  mode,
  initialValues,
  onClose,
  onSubmit,
  pending,
}: {
  mode: keyof typeof MODE_CONFIG;
  initialValues: StudentFormValues;
  onClose: () => void;
  onSubmit: (values: StudentFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const config = MODE_CONFIG[mode];
  const form = useForm<StudentFormValues>({
    initialValues,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = async (values: StudentFormValues) => {
    setError('');
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t(config.title)}
      centered
    >
      <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
        <Stack gap="md">
          <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
          <TextInput
            label={t('registration.phone')}
            required
            {...form.getInputProps('phone_number')}
          />
          {error && (
            <Text c="red" role="alert">
              {error}
            </Text>
          )}
          <Button type="submit" className={classes.submitButton} loading={pending}>
            {t('registration.save')}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function StudentListScreen() {
  const { t } = useTranslation();
  const { students, isLoading, error, reload, createStudent, creating, updateStudent, updating, deleteStudent } =
    useStudents();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [createOpened, setCreateOpened] = useState(false);
  const [editingId, setEditingId] = useState('');
  const editing = students.find((student) => student.id === editingId);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => sortRows(students, sort, SORT_VALUES), [students, sort]);

  const confirmRemove = (student: Student) => {
    openConfirmDialog({
      title: t('registration.deleteStudentTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.delete'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteStudent(student.id).catch(notifyApiError);
      },
    });
  };

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
        <Button className={classes.submitButton} onClick={() => setCreateOpened(true)}>
          {t('registration.addStudent')}
        </Button>
      </Group>
      {loadError && (
        <Group gap="xs">
          <Text c="red" role="alert">
            {loadError}
          </Text>
          <Button variant="subtle" size="xs" onClick={() => reload()}>
            {t('registration.retry')}
          </Button>
        </Group>
      )}
      <DataTable<Student>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('registration.emptyStudents')}
        actions={(row) => (
          <Group gap="xs">
            <button type="button" className={classes.rowAction} onClick={() => setEditingId(row.id)}>
              {t('registration.edit')}
            </button>
            <button type="button" className={classes.rowAction} onClick={() => confirmRemove(row)}>
              {t('registration.delete')}
            </button>
          </Group>
        )}
        actionsLabel={t('registration.columns.actions')}
      />
      {createOpened && (
        <StudentFormModal
          mode="create"
          initialValues={EMPTY_VALUES}
          onClose={() => setCreateOpened(false)}
          pending={creating}
          onSubmit={(values) => createStudent(values)}
        />
      )}
      {editing && (
        <StudentFormModal
          mode="edit"
          initialValues={{ name: editing.name, phone_number: editing.phone_number }}
          onClose={() => setEditingId('')}
          pending={updating}
          onSubmit={(values) =>
            updateStudent({ id: editing.id, body: values })
          }
        />
      )}
    </Stack>
  );
}
