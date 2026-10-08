import { Alert, Group, Select, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { useLanguages } from '@shared/hooks/useLanguages';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { needsLocal, type LocalizedValues } from '../utils/localized';

interface LocalizedFieldsProps {
  form: UseFormReturnType<LocalizedValues>;
  quiz?: boolean;
}

export function LocalizedFields({ form, quiz }: LocalizedFieldsProps) {
  const { t } = useTranslation();
  const { options, error, isLoading } = useLanguages();
  const languagesError = toApiErrorMessage(error);
  const showLocal = needsLocal(form.values.language);
  return (
    <>
    <Group gap="md" grow>
      <TextInput miw={200} label={t(quiz ? 'create.quizName' : 'create.name')} required {...form.getInputProps('title')} />
      {showLocal && (
        <TextInput
          miw={200}
          label={t(quiz ? 'create.localQuizName' : 'create.localName')}
          required
          {...form.getInputProps('localTitle')}
        />
      )}
      <TextInput miw={200} label={t('create.theme')} required {...form.getInputProps('theme')} />
      {showLocal && <TextInput miw={200} label={t('create.localTheme')} required {...form.getInputProps('localTheme')} />}
      <Select miw={200} label={t('create.language')} data={options} disabled={isLoading} allowDeselect={false} required {...form.getInputProps('language')} />
    </Group>
    {languagesError && <Alert>{languagesError}</Alert>}
    </>
  );
}
