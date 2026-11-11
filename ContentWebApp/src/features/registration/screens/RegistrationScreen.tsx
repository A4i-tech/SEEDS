import { Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRole } from '@features/auth/store/useAuthStore';
import { RegistrationCards, type Section } from '../components/RegistrationCards';
import { SchoolListScreen } from './SchoolListScreen';
import { StudentListScreen } from './StudentListScreen';
import { TeacherListScreen } from './TeacherListScreen';
import { PageTitle } from '@shared/components/PageTitle';

const SECTIONS_BY_ROLE = {
  tenant: ['schools'],
  school_admin: ['teachers', 'students'],
} as const;

export function RegistrationScreen() {
  const { t } = useTranslation();
  const role = useRole();
  const sections: readonly Section[] = role === 'tenant' ? SECTIONS_BY_ROLE.tenant : SECTIONS_BY_ROLE.school_admin;
  const [section, setSection] = useState<Section>(sections[0]);

  return (
    <Stack gap="md">
      <PageTitle title={t('registration.title')} />
      <Text c="dimmed">{t('registration.description')}</Text>
      <RegistrationCards sections={sections} active={section} onSelect={setSection} />
      {section === 'schools' && <SchoolListScreen />}
      {section === 'teachers' && <TeacherListScreen />}
      {section === 'students' && <StudentListScreen />}
    </Stack>
  );
}
