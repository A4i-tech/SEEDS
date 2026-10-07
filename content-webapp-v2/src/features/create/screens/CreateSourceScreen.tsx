import { Button, FileInput, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getLanguages } from '@shared/services/languages';
import type { QuizCreate } from '../../library/types/content.types';
import { useCreateQuiz } from '../hooks/useCreateQuiz';
import classes from './CreateSourceScreen.module.css';

interface DraftRow {
  key: number;
  text: string;
  answer: string;
}

export function CreateSourceScreen() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const [file, setFile] = useState<File | null>(null);
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [title, setTitle] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [localTheme, setLocalTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const createQuiz = useCreateQuiz();

  const languages = useQuery({
    queryKey: ['languages'],
    queryFn: getLanguages,
    enabled: status === 'authenticated',
  });

  const start = Number(startPage);
  const end = Number(endPage);
  const scopeValid = file !== null && Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start;
  const draftValid = scopeValid && rows.length > 0;

  const columns: DataTableColumn<DraftRow>[] = [
    { key: 'text', header: t('create.questionCol'), render: (row) => row.text },
    { key: 'answer', header: t('create.answerCol'), render: (row) => row.answer },
  ];

  const handleSave = async () => {
    setError(null);
    const needsLocal = language.toLowerCase() !== 'en';
    if (!draftValid || !title.trim() || !theme.trim() || !language || (needsLocal && (!localTitle.trim() || !localTheme.trim()))) {
      setError(t('create.sourceIncomplete'));
      return;
    }
    const payload: QuizCreate = {
      type: 'quiz',
      language,
      title: { english: title, local: needsLocal ? localTitle : title },
      theme: { english: theme, local: needsLocal ? localTheme : theme },
      description: `Source: ${file?.name ?? ''} pp.${start}-${end}`,
      questions: rows.map((r, qi) => ({
        question: { id: `q${qi + 1}`, text: r.text },
        options: [{ id: 'A', text: r.answer }],
        correct_option_id: 'A',
      })),
    };
    try {
      await createQuiz.mutateAsync(payload);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('create.sourceTitle')}</Title>
      <Text c="dimmed">{t('create.sourceHint')}</Text>
      <Stack gap="xs" className={classes.panel}>
        <FileInput
          label={t('create.sourceFile')}
          value={file}
          onChange={setFile}
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
        />
      </Stack>
      {file && (
        <Stack gap="xs" className={classes.panel}>
          <Text fw={700}>{t('create.scopeTitle')}</Text>
          <Group gap="md" grow>
            <TextInput
              label={t('create.startPage')}
              type="number"
              value={startPage}
              onChange={(e) => setStartPage(e.currentTarget.value)}
              required
            />
            <TextInput
              label={t('create.endPage')}
              type="number"
              value={endPage}
              onChange={(e) => setEndPage(e.currentTarget.value)}
              required
            />
          </Group>
        </Stack>
      )}
      {scopeValid && (
        <Stack gap="xs" className={classes.panel}>
          <Text fw={700}>{t('create.draftTitle')}</Text>
          <Group gap="md" grow>
            <TextInput
              label={t('create.quizName')}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
            />
            {language.toLowerCase() !== 'en' && language !== '' && (
              <TextInput
                label={t('create.localQuizName')}
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
          <Group gap="md" align="flex-end">
            <TextInput
              label={t('create.questionN', { n: rows.length + 1 })}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
            />
            <TextInput
              label={t('create.answerCol')}
              value={answer}
              onChange={(e) => setAnswer(e.currentTarget.value)}
            />
            <Button
              variant="outline"
              className={classes.secondaryButton}
              disabled={!draft.trim() || !answer.trim()}
              onClick={() => {
                setRows((prev) => [...prev, { key: prev.length, text: draft.trim(), answer: answer.trim() }]);
                setDraft('');
                setAnswer('');
              }}
            >
              {t('create.addQuestion')}
            </Button>
          </Group>
          <DataTable<DraftRow>
            columns={columns}
            rows={rows}
            getRowId={(row) => String(row.key)}
            page={page}
            pageSize={10}
            onPageChange={setPage}
            footerLayout="range"
            emptyMessage={t('create.sourceIncomplete')}
            actions={(row) => (
              <Button
                variant="transparent"
                size="sm"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                {t('create.remove')}
              </Button>
            )}
            actionsLabel={t('create.remove')}
          />
        </Stack>
      )}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      {draftValid && (
        <Group gap="md">
          <Button
            className={classes.submitButton}
            loading={createQuiz.isPending}
            onClick={() => void handleSave()}
          >
            {t('create.saveLibrary')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
