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
import { notifications } from '@mantine/notifications';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { useSchools } from '../hooks/useSchools';
import { useTableSort } from '../hooks/useTableSort';
import { useTeachers } from '../hooks/useTeachers';
import {
  teacherRegisterSchema,
  teacherUpdateSchema,
  type SchoolTeacher,
} from '../types/registration.types';
import classes from './TeacherListScreen.module.css';

type TeacherFormValues = {
  name: string;
  phone_number: string;
  password: string;
  role: string;
};

function TeacherFormModal({
  teacher,
  onClose,
  onSubmit,
  pending,
}: {
  teacher: SchoolTeacher | null;
  onClose: () => void;
  onSubmit: (values: TeacherFormValues) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TeacherFormValues>({
    initialValues: {
      name: teacher?.name ?? '',
      phone_number: teacher?.phone_number ?? '',
      password: '',
      role: teacher?.role ?? 'teacher',
    },
    validate: zodResolver(teacher ? teacherUpdateSchema : teacherRegisterSchema),
  });

  const handleSubmit = async (values: TeacherFormValues) => {
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
      title={teacher ? t('registration.editTeacher') : t('registration.addTeacher')}
      centered
    >
      <form onSubmit={form.onSubmit((values) => void handleSubmit(values))}>
        <Stack gap="md">
          <TextInput label={t('registration.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('registration.phone')} required {...form.getInputProps('phone_number')} />
          <PasswordInput
            label={teacher ? t('registration.newPassword') : t('registration.password')}
            required={!teacher}
            {...form.getInputProps('password')}
          />
          {!teacher && (
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
  const [error, setError] = useState<string | null>(null);

  const handleTransfer = async () => {
    setError(null);
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
          data={schools
            .filter((school) => school.id)
            .map((school) => ({ value: school.id as string, label: school.name }))}
          value={targetSchoolId}
          onChange={(value) => setTargetSchoolId(value ?? '')}
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
  const [editing, setEditing] = useState<SchoolTeacher | null>(null);
  const [transferringTeacher, setTransferringTeacher] = useState<SchoolTeacher | null>(null);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    if (!sort) return teachers;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...teachers].sort((a, b) => {
      const left = sort.key === 'phone' ? (a.phone_number ?? '') : a.name;
      const right = sort.key === 'phone' ? (b.phone_number ?? '') : b.name;
      return left.localeCompare(right) * direction;
    });
  }, [teachers, sort]);

  const confirmRemove = (teacher: SchoolTeacher) => {
    openConfirmDialog({
      title: t('registration.deleteTeacherTitle'),
      body: t('registration.deleteBody'),
      confirmLabel: t('registration.remove'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => {
        void deleteTeacher(teacher.id).catch((err: unknown) => {
          const message = toApiErrorMessage(err);
          if (message) notifications.show({ color: 'red', message });
        });
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
            {t(`registration.roles.${row.role === 'content_creator' ? 'content_creator' : 'teacher'}`)}
          </Text>
        </Stack>
      ),
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
        footerLayout="range"
        emptyMessage={t('registration.emptyTeachers')}
        actions={(row) => (
          <Group gap="xs">
            <button type="button" className={classes.rowAction} onClick={() => setEditing(row)}>
              {t('registration.edit')}
            </button>
            <button
              type="button"
              className={classes.rowAction}
              onClick={() => setTransferringTeacher(row)}
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
          teacher={null}
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
          teacher={editing}
          onClose={() => setEditing(null)}
          pending={updating}
          onSubmit={(values) =>
            updateTeacher({
              id: editing.id,
              body: {
                name: values.name,
                phone_number: values.phone_number,
                ...(values.password ? { password: values.password } : {}),
              },
            })
          }
        />
      )}
      {transferringTeacher && (
        <TransferModal
          teacher={transferringTeacher}
          onClose={() => setTransferringTeacher(null)}
          pending={transferring}
          onSubmit={(targetSchoolId) =>
            transferTeacher({ teacher_id: transferringTeacher.id, target_school_id: targetSchoolId })
          }
        />
      )}
    </Stack>
  );
}
