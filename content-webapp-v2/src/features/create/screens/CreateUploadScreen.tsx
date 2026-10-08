import { Button, FileInput, Group, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { useLanguages } from '@shared/hooks/useLanguages';
import type { ContentCreate } from '../../library/types/content.types';
import { toLocalized } from '../utils/localized';
import { useCreateContentAudio } from '../hooks/useCreateContent';
import classes from './CreateUploadScreen.module.css';

const experiences = ['story', 'song', 'poem', 'snippet'] as const;

export function CreateUploadScreen() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | undefined>(undefined);
  const [experience, setExperience] = useState('');
  const [title, setTitle] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [localTheme, setLocalTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const save = useCreateContentAudio();

  const { options: languageOptions } = useLanguages();

  const confirmSave = () => {
    setError('');
    const needsLocal = language.toLowerCase() !== 'en';
    if (!file || !experience || !title.trim() || !theme.trim() || !language || (needsLocal && (!localTitle.trim() || !localTheme.trim()))) {
      setError(t('create.contentIncomplete'));
      return;
    }
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      setError(t('create.mp3Only'));
      return;
    }
    const payload: ContentCreate = {
      type: experience,
      language,
      title: toLocalized(title, localTitle, needsLocal),
      theme: toLocalized(theme, localTheme, needsLocal),
      description: description || undefined,
    };
    openConfirmDialog({
      title: t('create.confirmUploadTitle'),
      body: t('create.confirmUploadBody'),
      confirmLabel: t('create.confirmUpload'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () =>
        void save.mutateAsync({ file, payload }).catch((err: unknown) => setError(toApiErrorMessage(err))),
    });
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('create.uploadTitle')}</Title>
      <Text c="dimmed">{t('create.audioHint')}</Text>
      <Stack gap="xs" className={classes.panel}>
        <FileInput
          label={t('create.audioFile')}
          onChange={(f) => setFile(f ?? undefined)}
          accept=".mp3,audio/mpeg"
          required
        />
        <Group gap="md" grow>
          <Select miw={200}
            label={t('create.experience')}
            value={experience}
            onChange={(v) => setExperience(selectValue(v))}
            data={experiences.map((e) => ({ value: e, label: t(`library.experiences.${e}`) }))}
            required
          />
          <Select miw={200}
            label={t('create.language')}
            value={language}
            onChange={(v) => setLanguage(selectValue(v))}
            data={languageOptions}
            required
          />
        </Group>
        <Group gap="md" grow>
          <TextInput miw={200}
            label={t('create.name')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
          />
          {language.toLowerCase() !== 'en' && language !== '' && (
            <TextInput miw={200}
              label={t('create.localName')}
              value={localTitle}
              onChange={(e) => setLocalTitle(e.currentTarget.value)}
              required
            />
          )}
          <TextInput miw={200}
            label={t('create.theme')}
            value={theme}
            onChange={(e) => setTheme(e.currentTarget.value)}
            required
          />
          {language.toLowerCase() !== 'en' && language !== '' && (
            <TextInput miw={200}
              label={t('create.localTheme')}
              value={localTheme}
              onChange={(e) => setLocalTheme(e.currentTarget.value)}
              required
            />
          )}
        </Group>
        <Textarea
          label={t('create.contentDescription')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={3}
        />
      </Stack>
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      <Group gap="md">
        <Button className={classes.submitButton} loading={save.isPending} onClick={confirmSave}>
          {t('create.saveLibrary')}
        </Button>
      </Group>
    </Stack>
  );
}
