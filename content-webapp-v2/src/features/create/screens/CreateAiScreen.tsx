import { Button, Group, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { ComingSoon } from '@shared/components/ComingSoon';
import { StatusBadge } from '@shared/components/StatusBadge';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { useLanguages } from '@shared/hooks/useLanguages';
import type { ContentCreate } from '../../library/types/content.types';
import { toLocalized } from '../utils/localized';
import { useCreateContentText } from '../hooks/useCreateContent';
import classes from './CreateAiScreen.module.css';

const experiences = ['story', 'song', 'poem', 'snippet'] as const;

const prefillSchema = z.object({ experience: z.string().default('') });

export function CreateAiScreen() {
  const { t } = useTranslation();
  const prefill = prefillSchema.parse(useSearch({ strict: false }));
  const [experience, setExperience] = useState(prefill.experience);
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState(false);
  const [title, setTitle] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [localTheme, setLocalTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [body, setBody] = useState(prompt);
  const [error, setError] = useState('');
  const save = useCreateContentText();

  const { options: languageOptions } = useLanguages();

  const handleSave = async () => {
    setError('');
    const needsLocal = language.toLowerCase() !== 'en';
    if (!experience || !title.trim() || !theme.trim() || !language || (needsLocal && (!localTitle.trim() || !localTheme.trim()))) {
      setError(t('create.aiIncomplete'));
      return;
    }
    const payload: ContentCreate = {
      type: experience,
      language,
      title: toLocalized(title, localTitle, needsLocal),
      theme: toLocalized(theme, localTheme, needsLocal),
      description: body,
    };
    try {
      await save.mutateAsync(payload);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('create.aiTitle')}</Title>
      <Group gap="md" grow>
        <Select miw={200}
          label={t('create.aiExperience')}
          value={experience}
          onChange={(v) => setExperience(selectValue(v))}
          data={experiences.map((e) => ({ value: e, label: t(`library.experiences.${e}`) }))}
          required
        />
      </Group>
      <Textarea
        label={t('create.aiPrompt')}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        minRows={3}
      />
      <Group gap="md">
        <Button
          variant="outline"
          className={classes.secondaryButton}
          disabled={!experience}
          onClick={() => {
            setBody(prompt);
            setGenerated(true);
          }}
        >
          {t('create.aiGenerate')}
        </Button>
      </Group>
      {generated && (
        <>
          <ComingSoon title={t('create.aiGenerateTitle')} />
          <StatusBadge tone="needs-review" label={t('create.aiDraftHint')} />
          <Stack gap="xs" className={classes.panel}>
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
              <Select miw={200}
                label={t('create.language')}
                value={language}
                onChange={(v) => setLanguage(selectValue(v))}
                data={languageOptions}
                required
              />
            </Group>
            <Textarea
              label={t('create.aiBody')}
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              minRows={5}
            />
          </Stack>
          {error && (
            <Text c="red" role="alert">
              {error}
            </Text>
          )}
          <Group gap="md">
            <Button className={classes.submitButton} loading={save.isPending} onClick={() => void handleSave()}>
              {t('create.saveLibrary')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
