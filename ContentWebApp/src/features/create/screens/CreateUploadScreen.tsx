import { Button, FileInput, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodValidate } from '@shared/utils/schema';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { ExperienceSelect } from '../components/ExperienceSelect';
import { LocalizedFields } from '../components/LocalizedFields';
import { useCreateContentAudio } from '../hooks/useCreateContent';
import { localizedFieldsSchema, requireLocal, toLocalizedFields } from '../utils/localized';
import { BackLink } from '@shared/components/BackLink';
import { PageTitle } from '@shared/components/PageTitle';

const uploadSchema = localizedFieldsSchema
  .extend({
    file: z.instanceof(File).nullable().refine((file) => file !== null, 'validation.required'),
    experience: z.string().min(1, 'validation.required'),
    description: z.string(),
  })
  .superRefine(requireLocal);

export function CreateUploadScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const save = useCreateContentAudio();

  const form = useForm<z.input<typeof uploadSchema>>({
    initialValues: {
      file: null,
      experience: '',
      description: '',
      title: '',
      localTitle: '',
      theme: '',
      localTheme: '',
      language: '',
    },
    validate: zodValidate(uploadSchema),
  });

  const confirmSave = (values: typeof form.values) => {
    const { file, experience, description, ...localized } = uploadSchema.parse(values);
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      form.setFieldError('file', t('create.mp3Only'));
      return;
    }
    openConfirmDialog({
      title: t('create.confirmUploadTitle'),
      body: t('create.confirmUploadBody'),
      confirmLabel: t('create.confirmUpload'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () =>
        save.mutate({
          file,
          payload: { type: experience, ...toLocalizedFields(localized), description },
        }),
    });
  };

  return (
    <form onSubmit={form.onSubmit(confirmSave)}>
      <Stack gap="md">
        <BackLink to="/create" label={t('create.back')} />
        <PageTitle title={t('create.uploadTitle')} />
        <Text c="dimmed">{t('create.audioHint')}</Text>
        <Paper p="md" radius="md">
          <Stack gap="xs">
            <Paper
              data-testid="audio-dropzone"
              p="md"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                form.setFieldValue('file', e.dataTransfer.files[0]);
              }}
            >
              <Text size="sm">{t('create.dropHint')}</Text>
              <FileInput
                label={t('create.audioFile')}
                accept=".mp3,audio/mpeg"
                required
                {...form.getInputProps('file')}
              />
            </Paper>
            <Group gap="md" grow>
              <ExperienceSelect label={t('create.experience')} {...form.getInputProps('experience')} />
            </Group>
            <LocalizedFields form={form} />
            <Textarea label={t('create.contentDescription')} minRows={3} {...form.getInputProps('description')} />
          </Stack>
        </Paper>
        <Group gap="md">
          <Button type="submit" loading={save.isPending}>
            {t('create.saveLibrary')}
          </Button>
          <Button variant="subtle" onClick={() => void navigate({ to: '/create' })}>
            {t('dialog.cancel')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
