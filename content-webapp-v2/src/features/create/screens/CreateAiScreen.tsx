import { Button, Group, Paper, Stack, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { ComingSoon } from '@shared/components/ComingSoon';
import { StatusBadge } from '@shared/components/StatusBadge';
import { ExperienceSelect } from '../components/ExperienceSelect';
import { LocalizedFields } from '../components/LocalizedFields';
import { useCreateContentText } from '../hooks/useCreateContent';
import { localizedFieldsSchema, requireLocal, toLocalizedFields } from '../utils/localized';

const prefillSchema = z.object({ experience: z.string().default('') });

const aiSchema = localizedFieldsSchema
  .extend({
    experience: z.string().min(1, 'Required'),
    prompt: z.string(),
    body: z.string(),
  })
  .superRefine(requireLocal);

export function CreateAiScreen() {
  const { t } = useTranslation();
  const prefill = prefillSchema.safeParse(useSearch({ strict: false }));
  const initialExperience = prefill.success ? prefill.data.experience : '';
  const [generated, { open: showGenerated }] = useDisclosure(false);
  const save = useCreateContentText();

  const form = useForm({
    initialValues: {
      experience: initialExperience,
      prompt: '',
      body: '',
      title: '',
      localTitle: '',
      theme: '',
      localTheme: '',
      language: '',
    },
    validate: zodResolver(aiSchema),
  });

  return (
    <form
      onSubmit={form.onSubmit(({ experience, body, ...localized }) =>
        save.mutate({ type: experience, ...toLocalizedFields(localized), description: body }),
      )}
    >
    <Stack gap="md">
      <Title order={2}>{t('create.aiTitle')}</Title>
      <Group gap="md" grow>
        <ExperienceSelect label={t('create.aiExperience')} {...form.getInputProps('experience')} />
      </Group>
      <Textarea label={t('create.aiPrompt')} minRows={3} {...form.getInputProps('prompt')} />
      <Group gap="md">
        <Button
          variant="outline"
          disabled={!form.values.experience}
          onClick={() => {
            form.setFieldValue('body', form.values.prompt);
            showGenerated();
          }}
        >
          {t('create.aiGenerate')}
        </Button>
      </Group>
      {generated && (
        <>
          <ComingSoon title={t('create.aiGenerateTitle')} />
          <StatusBadge tone="needs-review" label={t('create.aiDraftHint')} />
          <Paper p="md" radius="md">
            <Stack gap="xs">
              <LocalizedFields form={form} />
              <Textarea label={t('create.aiBody')} minRows={5} {...form.getInputProps('body')} />
            </Stack>
          </Paper>
          <Group gap="md">
            <Button type="submit" loading={save.isPending}>
              {t('create.saveLibrary')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
    </form>
  );
}
