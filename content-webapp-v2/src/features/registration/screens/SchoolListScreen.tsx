import { Button, Group, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
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
import { useSchools } from '../hooks/useSchools';
import { useConfirmRemove } from '../hooks/useConfirmRemove';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { schoolCreateSchema, schoolUpdateSchema, type School } from '../types/registration.types';

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

function SchoolFormModal({ school, onClose }: { school?: School; onClose: () => void }) {
  const { t } = useTranslation();
  const { create, update } = useSchools();
  const config = MODE_CONFIG[school ? 'edit' : 'create'];
  const form = useForm<SchoolFormValues>({
    initialValues: school ? { name: school.name, email: school.email, password: '' } : EMPTY_VALUES,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = (values: SchoolFormValues) => {
    const options = { onSuccess: onClose };
    if (school) {
      update.mutate(
        {
          id: school.id,
          body: {
            name: values.name,
            email: values.email,
            ...(values.password && { password: values.password }),
          },
        },
        options,
      );
    } else {
      create.mutate(values, options);
    }
  };

  return (
    <FormModal
      title={t(config.title)}
      submitLabel={t('registration.save')}
      mutation={school ? update : create}
      onClose={onClose}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
      <TextInput label={t('registration.email')} required {...form.getInputProps('email')} />
      <PasswordInput
        label={t(config.passwordLabel)}
        required={config.passwordRequired}
        {...form.getInputProps('password')}
      />
    </FormModal>
  );
}

export function SchoolListScreen() {
  const { t } = useTranslation();
  const { schools, isLoading, error, reload, remove } = useSchools();
  const confirmRemove = useConfirmRemove();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure();
  const [editingId, setEditingId] = useState('');
  const editing = schools.find((school) => school.id === editingId);

  const rows = useMemo(() => sortRows(schools, sort, SORT_VALUES), [schools, sort]);

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
        <Button onClick={openCreate}>{t('registration.createSchool')}</Button>
      </Group>
      <LoadError error={error} onRetry={reload} />
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
          <RowActions
            actions={[
              { label: t('registration.edit'), onClick: () => setEditingId(row.id) },
              {
                label: t('registration.delete'),
                onClick: () =>
                  confirmRemove(t('registration.deleteSchoolTitle'), t('registration.delete'), () =>
                    remove.mutateAsync(row.id),
                  ),
              },
            ]}
          />
        )}
        actionsLabel={t('registration.columns.actions')}
      />
      {createOpened && <SchoolFormModal onClose={closeCreate} />}
      {editing && <SchoolFormModal school={editing} onClose={() => setEditingId('')} />}
    </Stack>
  );
}
