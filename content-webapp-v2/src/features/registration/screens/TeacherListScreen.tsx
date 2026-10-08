import {
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
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
import { selectValue } from '@shared/utils/select';
import { useSchools } from '../hooks/useSchools';
import { sortRows, useTableSort } from '../hooks/useTableSort';
import { useTeachers } from '../hooks/useTeachers';
import {
  teacherRegisterSchema,
  teacherUpdateSchema,
  type SchoolTeacher,
} from '../types/registration.types';
import classes from './TeacherListScreen.module.css';
import { notifyApiError } from '@shared/utils/notifyApiError';

type TeacherFormValues = {
  name: string;
  phone_number: string;
  password: string;
  role: string;
};

const EMPTY_VALUES: TeacherFormValues = { name: '', phone_number: '', password: '', role: 'teacher' };

const MODE_CONFIG = {
  create: {
    title: 'registration.addTeacher',
    passwordLabel: 'registration.password',
    passwordRequired: true,
    showRole: true,
    schema: teacherRegisterSchema,
  },
  edit: {
    title: 'registration.editTeacher',
    passwordLabel: 'registration.newPassword',
    passwordRequired: false,
    showRole: false,
    schema: teacherUpdateSchema,
  },
};

const SORT_VALUES = {
  name: (teacher: SchoolTeacher) => teacher.name,
  phone: (teacher: SchoolTeacher) => teacher.phone_number,
};

function TeacherFormModal({
  mode,
  initialValues,
  onClose,
  onSubmit,
  pending,
}: {
  mode: keyof typeof MODE_CONFIG;
  initialValues: TeacherFormValues;
  onClose: () => void;
  onSubmit: (values: TeacherFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const config = MODE_CONFIG[mode];
  const form = useForm<TeacherFormValues>({
    initialValues,
    validate: zodResolver(config.schema),
  });

  const handleSubmit = async (values: TeacherFormValues) => {
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
          <TextInput label={t('registration.phone')} required {...form.getInputProps('phone_number')} />
          <PasswordInput
            label={t(config.passwordLabel)}
            required={config.passwordRequired}
            {...form.getInputProps('password')}
          />
          {config.showRole && (
            <Select
              label={t('registration.role')}
              data={[
                { value: 'teacher', label: t('registration.roles.teacher') },
                { value: 'content_creator', label: t('registration.roles.content_creator') },
              ]}
              {...form.getInputProps('role')}
            />
          )}
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

function TransferModal({
  teacher,
  onClose,
  onSubmit,
  pending,
}: {
  teacher: SchoolTeacher;
  onClose: () => void;
  onSubmit: (targetSchoolId: string) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const { schools } = useSchools();
  const [targetSchoolId, setTargetSchoolId] = useState('');
  const [error, setError] = useState('');

  const handleTransfer = async () => {
    setError('');
    try {
      await onSubmit(targetSchoolId);
      onClose();
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Modal opened onClose={onClose} title={t('registration.transferTeacher')} centered>
      <Stack gap="md">
        <Text size="sm">{t('registration.transferBody', { name: teacher.name })}</Text>
        <Select
          label={t('registration.targetSchool')}
          placeholder={t('registration.targetSchool')}
          data={schools.map((school) => ({ value: school.id, label: school.name }))}
          value={targetSchoolId}
          onChange={(value) => setTargetSchoolId(selectValue(value))}
        />
        {error && (
          <Text c="red" role="alert">
            {error}
          </Text>
        )}
        <Button
          className={classes.submitButton}
          loading={pending}
          disabled={!targetSchoolId}
          onClick={() => void handleTransfer()}
        >
          {t('registration.transfer')}
        </Button>
      </Stack>
    </Modal>
  );
}

export function TeacherListScreen() {
  const { t } = useTranslation();
  const {
    teachers,
    isLoading,
    error,
    reload,
    registerTeacher,
    registering,
    updateTeacher,
    updating,
    deleteTeacher,
    transferTeacher,
    transferring,
  } = useTeachers();
  const { sort, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [registerOpened, setRegisterOpened] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [transferringId, setTransferringId] = useState('');
  const editing = teachers.find((teacher) => teacher.id === editingId);
  const transferringTeacher = teachers.find((teacher) => teacher.id === transferringId);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => sortRows(teachers, sort, SORT_VALUES), [teachers, sort]);

  const confirmRemove = (teacher: SchoolTeacher) => {
    openConfirmDialog({
      title: t('registration.deleteTeacherTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.remove'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteTeacher(teacher.id).catch(notifyApiError);
      },
    });
  };

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
        <Button className={classes.submitButton} onClick={() => setRegisterOpened(true)}>
          {t('registration.addTeacher')}
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
          <Group gap="xs">
            <button type="button" className={classes.rowAction} onClick={() => setEditingId(row.id)}>
              {t('registration.edit')}
            </button>
            <button
              type="button"
              className={classes.rowAction}
              onClick={() => setTransferringId(row.id)}
            >
              {t('registration.transfer')}
            </button>
            <button type="button" className={classes.rowAction} onClick={() => confirmRemove(row)}>
              {t('registration.remove')}
            </button>
          </Group>
        )}
        actionsLabel={t('registration.columns.actions')}
      />
      {registerOpened && (
        <TeacherFormModal
          mode="create"
          initialValues={EMPTY_VALUES}
          onClose={() => setRegisterOpened(false)}
          pending={registering}
          onSubmit={(values) =>
            registerTeacher({
              name: values.name,
              phone_number: values.phone_number,
              password: values.password,
              role: values.role,
            })
          }
        />
      )}
      {editing && (
        <TeacherFormModal
          mode="edit"
          initialValues={{ ...EMPTY_VALUES, name: editing.name, phone_number: editing.phone_number }}
          onClose={() => setEditingId('')}
          pending={updating}
          onSubmit={(values) =>
            updateTeacher({
              id: editing.id,
              body: {
                name: values.name,
                phone_number: values.phone_number,
                ...(values.password && { password: values.password }),
              },
            })
          }
        />
      )}
      {transferringTeacher && (
        <TransferModal
          teacher={transferringTeacher}
          onClose={() => setTransferringId('')}
          pending={transferring}
          onSubmit={(targetSchoolId) =>
            transferTeacher({ teacher_id: transferringTeacher.id, target_school_id: targetSchoolId })
          }
        />
      )}
    </Stack>
  );
}
