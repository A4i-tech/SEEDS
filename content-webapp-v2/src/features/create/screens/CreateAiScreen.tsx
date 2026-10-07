import { Button, Group, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ComingSoon } from '@shared/components/ComingSoon';
import { StatusBadge } from '@shared/components/StatusBadge';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getLanguages } from '@shared/services/languages';
import type { ContentCreate } from '../../library/types/content.types';
import { useCreateContentText } from '../hooks/useCreateContent';
import classes from './CreateAiScreen.module.css';

const experiences = ['story', 'song', 'poem', 'snippet'] as const;

export function CreateAiScreen() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const [experience, setExperience] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState(false);
  const [title, setTitle] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [localTheme, setLocalTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [body, setBody] = useState(prompt);
  const [error, setError] = useState<string | null>(null);
  const save = useCreateContentText();

  const languages = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
    enabled: status === 'authenticated',
  });

  const handleSave = async () => {
    setError(null);
    const needsLocal = language.toLowerCase() !== 'en';
    if (!experience || !title.trim() || !theme.trim() || !language || (needsLocal && (!localTitle.trim() || !localTheme.trim()))) {
      setError(t('create.aiIncomplete'));
      return;
    }
    const payload: ContentCreate = {
      type: experience,
      language,
      title: { english: title, local: needsLocal ? localTitle : title },
      theme: { english: theme, local: needsLocal ? localTheme : theme },
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
        <Select
          label={t('create.aiExperience')}
          value={experience}
          onChange={(v) => setExperience(v ?? '')}
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
              <TextInput
                label={t('create.name')}
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                required
              />
              {language.toLowerCase() !== 'en' && language !== '' && (
                <TextInput
                  label={t('create.localName')}
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.currentTarget.value)}
                  required
                />
              )}
              <TextInput
                label={t('create.theme')}
                value={theme}
                onChange={(e) => setTheme(e.currentTarget.value)}
                required
              />
              {language.toLowerCase() !== 'en' && language !== '' && (
                <TextInput
                  label={t('create.localTheme')}
                  value={localTheme}
                  onChange={(e) => setLocalTheme(e.currentTarget.value)}
                  required
                />
              )}
              <Select
                label={t('create.language')}
                value={language}
                onChange={(v) => setLanguage(v ?? '')}
                data={(languages.data ?? []).map((l) => ({ value: l.code, label: l.name }))}
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
