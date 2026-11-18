import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { VolunteerFormModal } from '../components/VolunteerFormModal';

export function VolunteerScreen() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure();
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>{t('registration.tabs.volunteers')}</Title>
        <Button onClick={open}>{t('registration.addVolunteer')}</Button>
      </Group>
      <Text c="dimmed">{t('registration.volunteerHint')}</Text>
      {opened && <VolunteerFormModal onClose={close} />}
    </Stack>
  );
}
