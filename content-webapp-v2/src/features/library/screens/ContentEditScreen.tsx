import { Alert, Breadcrumbs, Button, Checkbox, Group, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { useLanguages } from '@shared/hooks/useLanguages';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getContentById, updateContent } from '../api/library';
import { CONTENT_UI, contentUpdateSchema, libraryKeys } from '../types/content.types';
import type { ContentItem } from '../types/content.types';

type EditValues = {
  id: string;
  title: { english: string; local: string };
  theme: { english: string; local: string };
  description: string;
  language: string;
  is_pull_model: boolean;
  is_teacher_app: boolean;
  audioUploaded: boolean;
};

function EditForm({ item }: { item: ContentItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { options, error: languagesLoadError } = useLanguages();
  const languagesError = toApiErrorMessage(languagesLoadError);

  const form = useForm<EditValues>({
    initialValues: {
      id: item.id,
      title: { english: item.title.english, local: item.title.local },
      theme: { english: item.theme.english, local: item.theme.local },
      description: item.description,
      language: item.language,
      is_pull_model: item.is_pull_model,
      is_teacher_app: item.is_teacher_app,
      audioUploaded: false,
    },
    validate: zodResolver(contentUpdateSchema),
  });

  const save = useMutation({
    mutationFn: ({ audioUploaded, ...values }: EditValues) =>
      updateContent(
        item.id,
        {
          ...values,
          title: { english: values.title.english, local: values.title.local || undefined },
          theme: { english: values.theme.english, local: values.theme.local || undefined },
          description: values.description || undefined,
          language: values.language || undefined,
        },
        audioUploaded,
      ),
    onSuccess: (updated) => {
      void navigate({ to: '/library/$kind/$id', params: { kind: updated.type, id: updated.id } });
    },
  });
  const error = toApiErrorMessage(save.error);
  const ui = CONTENT_UI[item.type];

  return (
    <form onSubmit={form.onSubmit((values) => save.mutate(values))}>
      <Stack gap="md">
      <TextInput label={t('library.titleEn')} {...form.getInputProps('title.english')} />
      <TextInput label={t('library.titleLocal')} {...form.getInputProps('title.local')} />
      <TextInput label={t('library.themeEn')} {...form.getInputProps('theme.english')} />
      <TextInput label={t('library.themeLocal')} {...form.getInputProps('theme.local')} />
      {ui.hasDescription && (
        <Textarea label={t('library.descriptionLabel')} {...form.getInputProps('description')} />
      )}
      {ui.preview === 'quiz' && <Text c="dimmed">{t('library.quizLocked')}</Text>}
      <Select label={t('library.languageLabel')} data={options} {...form.getInputProps('language')} />
      {languagesError && <Alert>{languagesError}</Alert>}
      <Checkbox label={t('library.pullModel')} {...form.getInputProps('is_pull_model', { type: 'checkbox' })} />
      <Checkbox label={t('library.teacherApp')} {...form.getInputProps('is_teacher_app', { type: 'checkbox' })} />
      {ui.hasAudioUpload && (
        <Checkbox label={t('library.audioUploaded')} {...form.getInputProps('audioUploaded', { type: 'checkbox' })} />
      )}
      {error && <Alert>{error}</Alert>}
      <Group gap="md">
        <Button type="submit" loading={save.isPending}>
          {t('library.save')}
        </Button>
        <Button
          variant="subtle"
          onClick={() => void navigate({ to: '/library/$kind/$id', params: { kind: item.type, id: item.id } })}
        >
          {t('dialog.cancel')}
        </Button>
      </Group>
      </Stack>
    </form>
  );
}

export function ContentEditScreen() {
  const { t } = useTranslation();
  const { kind = '', id = '' } = useParams({ strict: false });
  const status = useAuthStore((s) => s.status);

  const detail = useQuery({
    queryKey: libraryKeys.contentDetail(id),
    queryFn: () => getContentById(id),
    enabled: status === 'authenticated' && kind !== 'course' && id !== '',
  });

  const item = detail.data;
  const loadError = toApiErrorMessage(detail.error);
  const processing = item && item.type !== 'quiz' && !item.is_processed;
  const mismatch = item && item.type !== kind;

  return (
    <Stack gap="md" maw={640}>
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('library.title')}</Text>
        <Text>{item?.title.english || id}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('library.editTitle')}</Title>
      <Text c="dimmed">{t('library.editHint')}</Text>

      {detail.isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && <Alert>{loadError}</Alert>}
      {mismatch && <Alert>{t('library.wrongItem')}</Alert>}
      {processing && <Text c="dimmed">{t('library.processing')}</Text>}

      {item && !processing && !mismatch && <EditForm key={item.id} item={item} />}
    </Stack>
  );
}
