import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { LoadError } from '@shared/components/LoadError';
import { VolunteerFormModal } from '../components/VolunteerFormModal';
import { useVolunteers } from '../hooks/useVolunteers';
import type { Volunteer } from '../types/registration.types';

export function VolunteerScreen() {
  const { t } = useTranslation();
  const { state, volunteers, reload } = useVolunteers();
  const [opened, { open, close }] = useDisclosure();
  const [page, setPage] = useState(1);

  const columns: DataTableColumn<Volunteer>[] = [
    { key: 'name', header: t('registration.columns.name'), render: (row) => <Text variant="rowTitle">{row.name}</Text> },
    { key: 'email', header: t('registration.columns.email'), render: (row) => row.email },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>{t('registration.tabs.volunteers')}</Title>
        <Button onClick={open}>{t('registration.addVolunteer')}</Button>
      </Group>
      <Text c="dimmed">{t('registration.volunteerHint')}</Text>
      {state.status === 'error' && <LoadError error={state.error} onRetry={reload} />}
      <DataTable<Volunteer>
        columns={columns}
        rows={volunteers}
        getRowId={(row) => row.id}
        loading={state.status === 'loading'}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('registration.emptyVolunteers')}
      />
      {opened && <VolunteerFormModal onClose={close} />}
    </Stack>
  );
}
