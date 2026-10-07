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
import { notifications } from '@mantine/notifications';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useSchools } from '../hooks/useSchools';
import { useTableSort } from '../hooks/useTableSort';
import { schoolCreateSchema, schoolUpdateSchema, type School } from '../types/registration.types';
import classes from './SchoolListScreen.module.css';

type SchoolFormValues = {
  name: string;
  email: string;
  password: string;
};

function SchoolFormModal({
  school,
  onClose,
  onSubmit,
  pending,
}: {
  school: School | null;
  onClose: () => void;
  onSubmit: (values: SchoolFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SchoolFormValues>({
    initialValues: { name: school?.name ?? '', email: school?.email ?? '', password: '' },
    validate: zodResolver(school ? schoolUpdateSchema : schoolCreateSchema),
  });

  const handleSubmit = async (values: SchoolFormValues) => {
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
      title={school ? t('registration.editSchool') : t('registration.createSchool')}
      centered
    >
      <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
        <Stack gap="md">
          <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('registration.email')} required {...form.getInputProps('email')} />
          <PasswordInput
            label={school ? t('registration.newPassword') : t('registration.password')}
            required={!school}
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
  const [editing, setEditing] = useState<School | null>(null);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    if (!sort) return schools;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...schools].sort((a, b) => {
      const left = sort.key === 'email' ? (a.email ?? '') : a.name;
      const right = sort.key === 'email' ? (b.email ?? '') : b.name;
      return left.localeCompare(right) * direction;
    });
  }, [schools, sort]);

  const confirmRemove = (school: School) => {
    if (!school.id) return;
    const id = school.id;
    openConfirmDialog({
      title: t('registration.deleteSchoolTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.delete'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteSchool(id).catch((err: unknown) => {
          const message = toApiErrorMessage(err);
          if (message) notifications.show({ color: 'red', message });
        });
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
      render: (row) => row.email ?? '',
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
        getRowId={(row) => row.id ?? row.email ?? row.name}
        loading={isLoading}
        sort={sort}
        onSortChange={toggleSort}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        footerLayout="range"
        emptyMessage={t('registration.emptySchools')}
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
        <SchoolFormModal
          school={null}
          onClose={() => setCreateOpened(false)}
          pending={creating}
          onSubmit={(values) => createSchool(values)}
        />
      )}
      {editing && (
        <SchoolFormModal
          school={editing}
          onClose={() => setEditing(null)}
          pending={updating}
          onSubmit={(values) =>
            editing.id
              ? updateSchool({
                  id: editing.id,
                  body: {
                    name: values.name,
                    email: values.email,
                    ...(values.password ? { password: values.password } : {}),
                  },
                })
              : Promise.reject(new Error('Missing school id'))
          }
        />
      )}
    </Stack>
  );
}
