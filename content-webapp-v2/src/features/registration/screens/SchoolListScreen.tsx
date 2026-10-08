import {
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useSchools } from '../hooks/useSchools';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { schoolCreateSchema, schoolUpdateSchema, type School } from '../types/registration.types';
import classes from './SchoolListScreen.module.css';
import { notifyApiError } from '@shared/utils/notifyApiError';

type SchoolFormValues = {
  name: string;
  email: string;
  password: string;
};

const EMPTY_VALUES: SchoolFormValues = { name: '', email: '', password: '' };

const MODE_CONFIG = {
  create: {
    title: 'registration.createSchool',
    passwordLabel: 'registration.password',
    passwordRequired: true,
    schema: schoolCreateSchema,
  },
  edit: {
    title: 'registration.editSchool',
    passwordLabel: 'registration.newPassword',
    passwordRequired: false,
    schema: schoolUpdateSchema,
  },
};

const SORT_VALUES = {
  name: (school: School) => school.name,
  email: (school: School) => school.email,
};

function SchoolFormModal({
  mode,
  initialValues,
  onClose,
  onSubmit,
  pending,
}: {
  mode: keyof typeof MODE_CONFIG;
  initialValues: SchoolFormValues;
  onClose: () => void;
  onSubmit: (values: SchoolFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const config = MODE_CONFIG[mode];
  const form = useForm<SchoolFormValues>({
    initialValues,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = async (values: SchoolFormValues) => {
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
          <TextInput label={t('registration.email')} required {...form.getInputProps('email')} />
          <PasswordInput
            label={t(config.passwordLabel)}
            required={config.passwordRequired}
            {...form.getInputProps('password')}
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

export function SchoolListScreen() {
  const { t } = useTranslation();
  const { schools, isLoading, error, reload, createSchool, creating, updateSchool, updating, deleteSchool } =
    useSchools();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [createOpened, setCreateOpened] = useState(false);
  const [editingId, setEditingId] = useState('');
  const editing = schools.find((school) => school.id === editingId);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => sortRows(schools, sort, SORT_VALUES), [schools, sort]);

  const confirmRemove = (school: School) => {
    openConfirmDialog({
      title: t('registration.deleteSchoolTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.delete'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteSchool(school.id).catch(notifyApiError);
      },
    });
  };

  const columns: DataTableColumn<School>[] = [
    {
      key: 'name',
      header: t('registration.columns.name'),
      sortable: true,
      render: (row) => <Text fw={700}>{row.name}</Text>,
    },
    {
      key: 'email',
      header: t('registration.columns.email'),
      sortable: true,
      render: (row) => row.email,
    },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>{t('registration.tabs.schools')}</Title>
        <Button className={classes.submitButton} onClick={() => setCreateOpened(true)}>
          {t('registration.createSchool')}
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
      <DataTable<School>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('registration.emptySchools')}
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
        <SchoolFormModal
          mode="create"
          initialValues={EMPTY_VALUES}
          onClose={() => setCreateOpened(false)}
          pending={creating}
          onSubmit={(values) => createSchool(values)}
        />
      )}
      {editing && (
        <SchoolFormModal
          mode="edit"
          initialValues={{ name: editing.name, email: editing.email, password: '' }}
          onClose={() => setEditingId('')}
          pending={updating}
          onSubmit={(values) =>
            updateSchool({
              id: editing.id,
              body: {
                name: values.name,
                email: values.email,
                ...(values.password && { password: values.password }),
              },
            })
          }
        />
      )}
    </Stack>
  );
}
