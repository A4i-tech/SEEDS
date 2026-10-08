import { Button, FileInput, Group, Input, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { LocalizedFields } from '../components/LocalizedFields';
import { useCreateQuiz } from '../hooks/useCreateQuiz';
import { localizedFieldsSchema, requireLocal, toLocalizedFields } from '../utils/localized';

const pageNumber = z.string().transform((value) => (value === '' ? '0' : value));

const sourceSchema = localizedFieldsSchema
  .extend({
    file: z.instanceof(File).nullable().refine((file) => file !== null, 'Required'),
    startPage: pageNumber,
    endPage: pageNumber,
    draft: z.string(),
    answer: z.string(),
    questions: z.array(z.object({ id: z.string(), text: z.string(), answer: z.string() })).min(1, 'Required'),
  })
  .superRefine(requireLocal)
  .refine((values) => Number(values.endPage) >= Number(values.startPage), { path: ['endPage'], message: 'Invalid' });

type DraftRow = z.infer<typeof sourceSchema>['questions'][number];

export function CreateSourceScreen() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const createQuiz = useCreateQuiz();

  const form = useForm<z.input<typeof sourceSchema>>({
    initialValues: {
      file: null,
      startPage: '',
      endPage: '',
      draft: '',
      answer: '',
      questions: [],
      title: '',
      localTitle: '',
      theme: '',
      localTheme: '',
      language: '',
    },
    validate: zodResolver(sourceSchema),
  });

  const { file, draft, answer, questions } = form.values;

  const columns: DataTableColumn<DraftRow>[] = [
    { key: 'text', header: t('create.questionCol'), render: (row) => row.text },
    { key: 'answer', header: t('create.answerCol'), render: (row) => row.answer },
  ];

  const addQuestion = () => {
    const text = draft.trim();
    const answerText = answer.trim();
    if (text === '' || answerText === '') return;
    form.insertListItem('questions', { id: crypto.randomUUID(), text, answer: answerText });
    form.setValues({ draft: '', answer: '' });
  };

  return (
    <form
      onSubmit={form.onSubmit((values) => {
        const { file, startPage, endPage, questions, ...localized } = sourceSchema.parse(values);
        createQuiz.mutate({
          type: 'quiz',
          ...toLocalizedFields(localized),
          description: `Source: ${file.name} pp.${Number(startPage)}-${Number(endPage)}`,
          questions: questions.map((q, qi) => ({
            question: { id: `q${qi + 1}`, text: q.text },
            options: [{ id: 'A', text: q.answer }],
            correct_option_id: 'A',
          })),
        });
      })}
    >
      <Stack gap="md">
        <Title order={2}>{t('create.sourceTitle')}</Title>
        <Text c="dimmed">{t('create.sourceHint')}</Text>
        <Paper p="md" radius="md">
          <FileInput
            label={t('create.sourceFile')}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            {...form.getInputProps('file')}
          />
        </Paper>
        {file && (
          <Paper p="md" radius="md">
            <Stack gap="xs">
              <Text fw={700}>{t('create.scopeTitle')}</Text>
              <Group gap="md" grow>
                <TextInput
                  miw={200}
                  label={t('create.startPage')}
                  type="number"
                  required
                  {...form.getInputProps('startPage')}
                />
                <TextInput
                  miw={200}
                  label={t('create.endPage')}
                  type="number"
                  required
                  {...form.getInputProps('endPage')}
                />
              </Group>
            </Stack>
          </Paper>
        )}
        <Paper p="md" radius="md">
          <Stack gap="xs">
            <Text fw={700}>{t('create.draftTitle')}</Text>
            <LocalizedFields form={form} quiz />
            <Group gap="md" align="flex-end">
              <TextInput label={t('create.questionN', { n: questions.length + 1 })} {...form.getInputProps('draft')} />
              <TextInput label={t('create.answerCol')} {...form.getInputProps('answer')} />
              <Button variant="outline" onClick={addQuestion}>
                {t('create.addQuestion')}
              </Button>
            </Group>
            <DataTable<DraftRow>
              columns={columns}
              rows={questions}
              getRowId={(row) => row.id}
              page={page}
              pageSize={10}
              onPageChange={setPage}
              emptyMessage={t('create.sourceIncomplete')}
              actions={(row) => (
                <Button
                  variant="transparent"
                  size="sm"
                  onClick={() => form.removeListItem('questions', questions.indexOf(row))}
                >
                  {t('create.remove')}
                </Button>
              )}
              actionsLabel={t('create.remove')}
            />
            <Input.Error>{form.errors.questions}</Input.Error>
          </Stack>
        </Paper>
        <Group gap="md">
          <Button type="submit" loading={createQuiz.isPending}>
            {t('create.saveLibrary')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
