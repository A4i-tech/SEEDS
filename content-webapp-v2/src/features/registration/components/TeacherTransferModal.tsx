import { Select, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectValue } from '@shared/utils/select';
import { FormModal } from './FormModal';
import { useSchools } from '../hooks/useSchools';
import { useTeachers } from '../hooks/useTeachers';
import type { SchoolTeacher } from '../types/registration.types';

export function TransferModal({ teacher, onClose }: { teacher: SchoolTeacher; onClose: () => void }) {
  const { t } = useTranslation();
  const { schools } = useSchools();
  const { transfer } = useTeachers();
  const [targetSchoolId, setTargetSchoolId] = useState('');

  return (
    <FormModal
      title={t('registration.transferTeacher')}
      submitLabel={t('registration.transfer')}
      submitDisabled={!targetSchoolId}
      mutation={transfer}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        transfer.mutate(
          { teacher_id: teacher.id, target_school_id: targetSchoolId },
          { onSuccess: onClose },
        );
      }}
    >
      <Text size="sm">{t('registration.transferBody', { name: teacher.name })}</Text>
      <Select
        label={t('registration.targetSchool')}
        placeholder={t('registration.targetSchool')}
        data={schools.map((school) => ({ value: school.id, label: school.name }))}
        value={targetSchoolId}
        onChange={(value) => setTargetSchoolId(selectValue(value))}
      />
    </FormModal>
  );
}
