import { Stack, Tabs, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useRole } from '@features/auth/store/useAuthStore';
import { RegistrationCounts } from '../components/RegistrationCounts';
import { SchoolListScreen } from './SchoolListScreen';
import { StudentListScreen } from './StudentListScreen';
import { TeacherListScreen } from './TeacherListScreen';
import { PageTitle } from '@shared/components/PageTitle';

export function RegistrationScreen() {
  const { t } = useTranslation();
  const role = useRole();

  return (
    <Stack gap="md">
      <PageTitle title={t('registration.title')} />
      <Text c="dimmed">{t('registration.description')}</Text>
      <RegistrationCounts />
      {role === 'tenant' && <SchoolListScreen />}
      {role !== 'tenant' && (
        <Tabs defaultValue={role === 'school_admin' ? 'teachers' : 'students'}>
          <Tabs.List>
            {role === 'school_admin' && <Tabs.Tab value="teachers">{t('registration.tabs.teachers')}</Tabs.Tab>}
            <Tabs.Tab value="students">{t('registration.tabs.students')}</Tabs.Tab>
          </Tabs.List>
          {role === 'school_admin' && (
            <Tabs.Panel value="teachers" pt="md">
              <TeacherListScreen />
            </Tabs.Panel>
          )}
          <Tabs.Panel value="students" pt="md">
            <StudentListScreen />
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
