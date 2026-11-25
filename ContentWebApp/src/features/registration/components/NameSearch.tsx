import { TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function NameSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const label = t('registration.search');
  return (
    <TextInput
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
