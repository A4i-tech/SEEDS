import { Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useStudents } from '../hooks/useStudents';
import { useTableSort } from '../hooks/useTableSort';
import { studentCreateSchema, studentUpdateSchema, type Student } from '../types/registration.types';
import classes from './StudentListScreen.module.css';

type StudentFormValues = {
  name: string;
  phone_number: string;
};

function StudentFormModal({
  student,
  onClose,
  onSubmit,
  pending,
}: {
  student: Student | null;
  onClose: () => void;
  onSubmit: (values: StudentFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<StudentFormValues>({
    initialValues: { name: student?.name ?? '', phone_number: student?.phone_number ?? '' },
    validate: zodResolver(student ? studentUpdateSchema : studentCreateSchema),
  });

  const handleSubmit = async (values: StudentFormValues) => {
    setError(null);
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
      title={student ? t('registration.editStudent') : t('registration.addStudent')}
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
  const [editing, setEditing] = useState<Student | null>(null);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    if (!sort) return students;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const left = sort.key === 'phone' ? (a.phone_number ?? '') : a.name;
      const right = sort.key === 'phone' ? (b.phone_number ?? '') : b.name;
      return left.localeCompare(right) * direction;
    });
  }, [students, sort]);

  const confirmRemove = (student: Student) => {
    if (!student.id) return;
    const id = student.id;
    openConfirmDialog({
      title: t('registration.deleteStudentTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.delete'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteStudent(id).catch((err: unknown) => {
          const message = toApiErrorMessage(err);
          if (message) notifications.show({ color: 'red', message });
        });
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
      render: (row) => row.phone_number ?? '',
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
        getRowId={(row) => row.id ?? row.phone_number ?? row.name}
        loading={isLoading}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        footerLayout="range"
        emptyMessage={t('registration.emptyStudents')}
        actions={(row) => (
          <Group gap="xs">
            <button type="button" className={classes.rowAction} onClick={() => setEditing(row)}>
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
          student={null}
          onClose={() => setCreateOpened(false)}
          pending={creating}
          onSubmit={(values) => createStudent(values)}
        />
      )}
      {editing && (
        <StudentFormModal
          student={editing}
          onClose={() => setEditing(null)}
          pending={updating}
          onSubmit={(values) =>
            editing.id
              ? updateStudent({ id: editing.id, body: values })
              : Promise.reject(new Error('Missing student id'))
          }
        />
      )}
    </Stack>
  );
}
