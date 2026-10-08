import { useMediaQuery } from '@mantine/hooks';
import { Button, Group, Radio, SegmentedControl, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '@shared/components/ComingSoon';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { selectValue } from '@shared/utils/select';
import { useLanguages } from '@shared/hooks/useLanguages';
import type { QuizCreate } from '../../library/types/content.types';
import { toLocalized } from '../utils/localized';
import { useCreateQuiz } from '../hooks/useCreateQuiz';
import classes from './QuizBuilderScreen.module.css';

interface DraftOption {
  id: string;
  text: string;
}

interface DraftQuestion {
  key: number;
  text: string;
  options: DraftOption[];
  correctOptionId: string;
}

const starterSchema = z.enum(['blank', 'ai', 'source']);

function blankQuestion(key: number): DraftQuestion {
  return {
    key,
    text: '',
    options: [
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' },
    ],
    correctOptionId: 'A',
  };
}

export function QuizBuilderScreen() {
  const { t } = useTranslation();
  const [starter, setStarter] = useState<z.infer<typeof starterSchema>>('blank');
  const [title, setTitle] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [localTheme, setLocalTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion(0)]);
  const [error, setError] = useState('');
  const createQuiz = useCreateQuiz();

  const { options: languageOptions } = useLanguages();

  const updateQuestion = (key: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  const updateOption = (key: number, id: string, text: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === key ? { ...q, options: q.options.map((o) => (o.id === id ? { ...o, text } : o)) } : q,
      ),
    );
  };

  const handleSave = async () => {
    setError('');
    const needsLocal = language.toLowerCase() !== 'en';
    if (!title.trim() || !theme.trim() || !language || (needsLocal && (!localTitle.trim() || !localTheme.trim()))) {
      setError(t('create.quizIncomplete'));
      return;
    }
    const payload: QuizCreate = {
      type: 'quiz',
      language,
      title: toLocalized(title, localTitle, needsLocal),
      theme: toLocalized(theme, localTheme, needsLocal),
      questions: questions.map((q, qi) => ({
        question: { id: `q${qi + 1}`, text: q.text },
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        correct_option_id: q.correctOptionId,
      })),
    };
    try {
      await createQuiz.mutateAsync(payload);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  const isMobile = useMediaQuery('(max-width: 36em)');
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
        <>
          <Group gap="md" grow>
            <TextInput miw={200}
              label={t('create.quizName')}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
            />
            {language.toLowerCase() !== 'en' && language !== '' && (
              <TextInput miw={200}
                label={t('create.localQuizName')}
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
          {questions.map((q, qi) => (
            <Stack key={q.key} gap="xs" className={classes.question}>
              <Text fw={700}>{t('create.questionN', { n: qi + 1 })}</Text>
              <TextInput
                aria-label={t('create.questionN', { n: qi + 1 })}
                value={q.text}
                onChange={(e) => updateQuestion(q.key, { text: e.currentTarget.value })}
              />
              <Radio.Group
                value={q.correctOptionId}
                onChange={(v) => updateQuestion(q.key, { correctOptionId: v })}
                label={t('create.correctAnswer')}
              >
                <Stack gap="xs">
                  {q.options.map((o) => (
                    <Group key={o.id} gap="xs">
                      <Radio value={o.id} aria-label={t('create.optionN', { n: o.id })} />
                      <TextInput
                        aria-label={t('create.optionN', { n: o.id })}
                        value={o.text}
                        onChange={(e) => updateOption(q.key, o.id, e.currentTarget.value)}
                        className={classes.option}
                      />
                    </Group>
                  ))}
                </Stack>
              </Radio.Group>
            </Stack>
          ))}
          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={() => setQuestions((prev) => [...prev, blankQuestion(prev.length)])}
            >
              {t('create.addQuestion')}
            </Button>
          </Group>
          {error && (
            <Text c="red" role="alert">
              {error}
            </Text>
          )}
          <Group gap="md">
            <Button
              className={classes.submitButton}
              loading={createQuiz.isPending}
              onClick={() => void handleSave()}
            >
              {t('create.saveLibrary')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
