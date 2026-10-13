import { Select, type SelectProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { experiences } from '../utils/localized';

export function ExperienceSelect(props: Omit<SelectProps, 'data'>) {
  const { t } = useTranslation();
  return (
    <Select
      miw={200}
      data={experiences.map((e) => ({ value: e, label: t(`library.experiences.${e}`) }))}
      allowDeselect={false}
      required
      {...props}
    />
  );
}
