import { useMediaQuery } from '@mantine/hooks';
import { Button, Group, Paper, Radio, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '@shared/components/ComingSoon';
import { LocalizedFields } from '../components/LocalizedFields';
import { useCreateQuiz } from '../hooks/useCreateQuiz';
import { localizedFieldsSchema, requireLocal, toLocalizedFields } from '../utils/localized';

const starterSchema = z.enum(['blank', 'ai', 'source']);

const quizSchema = localizedFieldsSchema
  .extend({
    questions: z.array(
      z.object({
        text: z.string(),
        options: z.array(z.object({ id: z.string(), text: z.string() })),
        correctOptionId: z.string(),
      }),
    ),
  })
  .superRefine(requireLocal);

const blankQuestion = () => ({
  text: '',
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: '' })),
  correctOptionId: 'A',
});

export function QuizBuilderScreen() {
  const { t } = useTranslation();
  const [starter, setStarter] = useState<z.infer<typeof starterSchema>>('blank');
  const createQuiz = useCreateQuiz();
  const isMobile = useMediaQuery('(max-width: 36em)');

  const form = useForm<z.input<typeof quizSchema>>({
    initialValues: {
      title: '',
      localTitle: '',
      theme: '',
      localTheme: '',
      language: '',
      questions: [blankQuestion()],
    },
    validate: zodResolver(quizSchema),
  });

  return (
    <Stack gap="md">
      <Title order={2}>{t('create.quizTitle')}</Title>
      <SegmentedControl
        orientation={isMobile ? 'vertical' : 'horizontal'}
        value={starter}
        onChange={(v) => setStarter(starterSchema.parse(v))}
        data={starterSchema.options.map((value) => ({ value, label: t(`create.starters.${value}`) }))}
        aria-label={t('create.startFrom')}
      />
      {starter !== 'blank' && <ComingSoon title={t(`create.starters.${starter}`)} />}
      {starter === 'blank' && (
        <form
          onSubmit={form.onSubmit(({ questions, ...localized }) =>
            createQuiz.mutate({
              type: 'quiz',
              ...toLocalizedFields(localized),
              questions: questions.map((q, qi) => ({
                question: { id: `q${qi + 1}`, text: q.text },
                options: q.options,
                correct_option_id: q.correctOptionId,
              })),
            }),
          )}
        >
          <Stack gap="md">
            <LocalizedFields form={form} quiz />
            {form.values.questions.map((q, qi) => (
              <Paper key={form.key(`questions.${qi}`)} p="md" radius="md">
                <Stack gap="xs">
                  <Text fw={700}>{t('create.questionN', { n: qi + 1 })}</Text>
                  <TextInput
                    aria-label={t('create.questionN', { n: qi + 1 })}
                    {...form.getInputProps(`questions.${qi}.text`)}
                  />
                  <Radio.Group
                    label={t('create.correctAnswer')}
                    {...form.getInputProps(`questions.${qi}.correctOptionId`)}
                  >
                    <Stack gap="xs">
                      {q.options.map((o, oi) => (
                        <Group key={o.id} gap="xs">
                          <Radio value={o.id} aria-label={t('create.optionN', { n: o.id })} />
                          <TextInput
                            flex={1}
                            aria-label={t('create.optionN', { n: o.id })}
                            {...form.getInputProps(`questions.${qi}.options.${oi}.text`)}
                          />
                        </Group>
                      ))}
                    </Stack>
                  </Radio.Group>
                </Stack>
              </Paper>
            ))}
            <Group gap="md">
              <Button variant="outline" onClick={() => form.insertListItem('questions', blankQuestion())}>
                {t('create.addQuestion')}
              </Button>
            </Group>
            <Group gap="md">
              <Button type="submit" loading={createQuiz.isPending}>
                {t('create.saveLibrary')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
