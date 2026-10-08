import { Breadcrumbs, Button, Checkbox, Group, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { getLanguages } from '@shared/services/languages';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { getContentById, updateContent } from '../api/library';
import { contentUpdateSchema } from '../types/content.types';
import type { ContentItem } from '../types/content.types';
import classes from './ContentEditScreen.module.css';

function EditForm({ item }: { item: ContentItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);

  const [titleEn, setTitleEn] = useState(item.title.english);
  const [titleLocal, setTitleLocal] = useState(item.title.local);
  const [themeEn, setThemeEn] = useState(item.theme.english);
  const [themeLocal, setThemeLocal] = useState(item.theme.local);
  const [description, setDescription] = useState(item.description);
  const [language, setLanguage] = useState(item.language);
  const [isPullModel, setIsPullModel] = useState(item.is_pull_model);
  const [isTeacherApp, setIsTeacherApp] = useState(item.is_teacher_app);
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [error, setError] = useState('');

  const languages = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
    enabled: status === 'authenticated',
  });
  const languagesError = toApiErrorMessage(languages.error);

  const save = useMutation({
    mutationFn: () => {
      const patch = contentUpdateSchema.parse({
        id: item.id,
        title: { english: titleEn, local: titleLocal || undefined },
        theme: { english: themeEn, local: themeLocal || undefined },
        description: description || undefined,
        language: language || undefined,
        is_pull_model: isPullModel,
        is_teacher_app: isTeacherApp,
      });
      return updateContent(item.id, patch, audioUploaded);
    },
    onSuccess: (updated) => {
      void navigate({ to: '/library/$kind/$id', params: { kind: updated.type, id: updated.id } });
    },
    onError: (err) => setError(toApiErrorMessage(err)),
  });

  return (
    <>
      <TextInput label={t('library.titleEn')} value={titleEn} onChange={(e) => setTitleEn(e.currentTarget.value)} />
      <TextInput
        label={t('library.titleLocal')}
        value={titleLocal}
        onChange={(e) => setTitleLocal(e.currentTarget.value)}
      />
      <TextInput label={t('library.themeEn')} value={themeEn} onChange={(e) => setThemeEn(e.currentTarget.value)} />
      <TextInput
        label={t('library.themeLocal')}
        value={themeLocal}
        onChange={(e) => setThemeLocal(e.currentTarget.value)}
      />
      {item.type !== 'quiz' && (
        <Textarea
          label={t('library.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
      )}
      {item.type === 'quiz' && <Text c="dimmed">{t('library.quizLocked')}</Text>}
      <Select
        label={t('library.languageLabel')}
        value={language}
        onChange={(v) => setLanguage(selectValue(v))}
        data={(languages.data ?? []).map((l) => ({ value: l.code, label: l.name }))}
      />
      {languagesError && (
        <Text c="red" role="alert">
          {languagesError}
        </Text>
      )}
      <Checkbox
        label={t('library.pullModel')}
        checked={isPullModel}
        onChange={(e) => setIsPullModel(e.currentTarget.checked)}
      />
      <Checkbox
        label={t('library.teacherApp')}
        checked={isTeacherApp}
        onChange={(e) => setIsTeacherApp(e.currentTarget.checked)}
      />
      {item.type !== 'quiz' && (
        <Checkbox
          label={t('library.audioUploaded')}
          checked={audioUploaded}
          onChange={(e) => setAudioUploaded(e.currentTarget.checked)}
        />
      )}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      <Group gap="md">
        <Button className={classes.submitButton} loading={save.isPending} onClick={() => void save.mutateAsync()}>
          {t('library.save')}
        </Button>
        <Button variant="subtle" onClick={() => void navigate({ to: '/library/$kind/$id', params: { kind: item.type, id: item.id } })}>
          {t('dialog.cancel')}
        </Button>
      </Group>
    </>
  );
}

export function ContentEditScreen() {
  const { t } = useTranslation();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: ['library', 'content', id],
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });

  const item = detail.data;
  const loadError = toApiErrorMessage(detail.error);
  const processing = item && item.type !== 'quiz' && !item.is_processed;
  const mismatch = item && item.type !== kind;

  return (
    <Stack gap="md" className={classes.form}>
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{item?.title.english || id}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('library.editTitle')}</Title>
      <Text c="dimmed">{t('library.editHint')}</Text>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {mismatch && (
        <Text c="red" role="alert">
          {t('library.wrongItem')}
        </Text>
      )}
      {processing && <Text c="dimmed">{t('library.processing')}</Text>}

      {item && !processing && !mismatch && <EditForm key={item.id} item={item} />}
    </Stack>
  );
}
