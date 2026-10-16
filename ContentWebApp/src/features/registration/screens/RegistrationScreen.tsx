import { Stack, Tabs, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { SchoolListScreen } from './SchoolListScreen';
import { StudentListScreen } from './StudentListScreen';
import { TeacherListScreen } from './TeacherListScreen';

export function RegistrationScreen() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.role);

  return (
    <Stack gap="md">
      <Title order={2}>{t('registration.title')}</Title>
      <Text c="dimmed">{t('registration.description')}</Text>
      {role === 'tenant' && <SchoolListScreen />}
      {role !== 'tenant' && (
        <Tabs defaultValue="teachers">
          <Tabs.List>
            <Tabs.Tab value="teachers">{t('registration.tabs.teachers')}</Tabs.Tab>
            <Tabs.Tab value="students">{t('registration.tabs.students')}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="teachers" pt="md">
            <TeacherListScreen />
          </Tabs.Panel>
          <Tabs.Panel value="students" pt="md">
            <StudentListScreen />
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
