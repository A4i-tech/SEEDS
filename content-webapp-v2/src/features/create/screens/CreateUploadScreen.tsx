import { Button, FileInput, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { ExperienceSelect } from '../components/ExperienceSelect';
import { LocalizedFields } from '../components/LocalizedFields';
import { useCreateContentAudio } from '../hooks/useCreateContent';
import { localizedFieldsSchema, requireLocal, toLocalizedFields } from '../utils/localized';

const uploadSchema = localizedFieldsSchema
  .extend({
    file: z.instanceof(File).nullable().refine((file) => file !== null, 'Required'),
    experience: z.string().min(1, 'Required'),
    description: z.string(),
  })
  .superRefine(requireLocal);

export function CreateUploadScreen() {
  const { t } = useTranslation();
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
    validate: zodResolver(uploadSchema),
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
          payload: { type: experience, ...toLocalizedFields(localized), description: description || undefined },
        }),
    });
  };

  return (
    <form onSubmit={form.onSubmit(confirmSave)}>
      <Stack gap="md">
        <Title order={2}>{t('create.uploadTitle')}</Title>
        <Text c="dimmed">{t('create.audioHint')}</Text>
        <Paper p="md" radius="md">
          <Stack gap="xs">
            <FileInput
              label={t('create.audioFile')}
              accept=".mp3,audio/mpeg"
              required
              {...form.getInputProps('file')}
            />
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
        </Group>
      </Stack>
    </form>
  );
}
