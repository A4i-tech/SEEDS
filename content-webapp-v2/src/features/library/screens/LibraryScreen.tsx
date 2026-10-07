import { Button, Chip, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { ContentItem } from '../types/content.types';
import type { Course } from '../api/library';
import { useLibrary } from '../hooks/useLibrary';
import classes from './LibraryScreen.module.css';

type Experience = 'poem' | 'story' | 'quiz' | 'lesson' | 'course' | 'audio' | 'song' | 'textbook' | 'webpage';

const experiences: Experience[] = ['poem', 'story', 'quiz', 'lesson', 'course', 'audio', 'song', 'textbook', 'webpage'];

interface LibraryRow {
  id: string;
  title: string;
  subtitle: string;
  theme: string;
  themeSub: string;
  uploaded: string;
  language: string;
  kind: string;
  isCourse: boolean;
}

function languageName(code: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function contentRow(item: ContentItem): LibraryRow {
  const uploaded = [
    item.is_teacher_app ? 'TA' : '',
    item.is_pull_model || item.type === 'quiz' ? 'IVR' : '',
  ]
    .filter((flag) => flag !== '')
    .join(', ');
  return {
    id: item.id,
    title: item.title?.english ?? '',
    subtitle: item.title?.local ?? '',
    theme: item.theme?.english ?? '',
    themeSub: item.theme?.local ?? '',
    uploaded,
    language: languageName(item.language),
    kind: item.type,
    isCourse: false,
  };
}

function courseRow(course: Course): LibraryRow {
  return {
    id: course.id,
    title: course.name,
    subtitle: course.number ?? '',
    theme: course.org ?? '',
    themeSub: '',
    uploaded: course.synced ? 'Synced' : 'Never synced',
    language: languageName(course.language ?? ''),
    kind: 'course',
    isCourse: true,
  };
}

export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { content, courses, isLoading, error, reload, removeContent, removeCourse, syncAll, syncingAll, refreshIvr } =
    useLibrary();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Experience[]>([]);
  const [page, setPage] = useState(1);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...content.map(contentRow), ...courses.map(courseRow)].filter(
      (row) =>
        (selected.length === 0 || selected.includes(row.kind as Experience)) &&
        (!q ||
          row.title.toLowerCase().includes(q) ||
          row.language.toLowerCase().includes(q) ||
          row.kind.includes(q)),
    );
  }, [content, courses, query, selected]);

  const confirmRemove = (row: LibraryRow) => {
    openConfirmDialog({
      title: t('library.deleteTitle'),
      body: t('library.deleteBody'),
      confirmLabel: t('library.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => void (row.isCourse ? removeCourse(row.id) : removeContent(row.id)),
    });
  };

  const columns: DataTableColumn<LibraryRow>[] = [
    {
      key: 'title',
      header: t('library.columns.title'),
      render: (row) => (
        <Stack gap={0}>
          <Text fw={700}>{row.title}</Text>
          {row.subtitle && (
            <Text size="sm" c="dimmed">
              {row.subtitle}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: 'theme',
      header: t('library.columns.theme'),
      render: (row) => (
        <Stack gap={0}>
          <Text>{row.theme}</Text>
          {row.themeSub && (
            <Text size="sm" c="dimmed">
              {row.themeSub}
            </Text>
          )}
        </Stack>
      ),
    },
    { key: 'uploaded', header: t('library.columns.uploaded'), render: (row) => row.uploaded },
    { key: 'language', header: t('library.columns.language'), render: (row) => row.language },
    { key: 'kind', header: t('library.columns.kind'), render: (row) => t(`library.experiences.${row.kind}`) },
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('library.title')}</Title>
      <Text c="dimmed">{t('library.description')}</Text>
      <Group gap="md">
        <Button variant="outline" className={classes.secondaryButton} onClick={() => void refreshIvr()}>
          {t('library.updateIvr')}
        </Button>
        <Button
          variant="outline"
          className={classes.secondaryButton}
          onClick={() => void navigate(routePaths.ivrView)}
        >
          {t('library.viewIvr')}
        </Button>
        <Button
          variant="outline"
          className={classes.secondaryButton}
          loading={syncingAll}
          onClick={() => void syncAll()}
        >
          {t('library.syncAll')}
        </Button>
        <Button className={classes.submitButton} onClick={() => void navigate(routePaths.create)}>
          {t('library.addContent')}
        </Button>
      </Group>
      <Text fw={700}>{t('library.filterContent')}</Text>
      <Group gap="md">
        <TextInput
          aria-label={t('library.search')}
          placeholder={t('library.search')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className={classes.search}
        />
      </Group>
      <Group gap="xs" aria-label={t('library.experience')}>
        <Chip.Group multiple value={selected} onChange={setSelected}>
          {experiences.map((exp) => (
            <Chip key={exp} value={exp}>
              {t(`library.experiences.${exp}`)}
            </Chip>
          ))}
        </Chip.Group>
      </Group>
      {loadError && (
        <Group gap="xs">
          <Text c="red" role="alert">
            {loadError}
          </Text>
          <Button variant="subtle" size="xs" onClick={() => reload()}>
            {t('library.retry')}
          </Button>
        </Group>
      )}
      <DataTable<LibraryRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => `${row.isCourse ? 'course' : 'content'}:${row.id}`}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('library.empty')}
        actions={(row) => (
          <Group gap="xs">
            <button
              type="button"
              className={classes.rowAction}
              onClick={() =>
                void navigate(
                  row.isCourse ? `${routePaths.library}/course/${row.id}` : `${routePaths.library}/${row.kind}/${row.id}`,
                )
              }
            >
              {t('library.view')}
            </button>
            <button type="button" className={classes.rowAction} onClick={() => confirmRemove(row)}>
              {t('library.delete')}
            </button>
          </Group>
        )}
        actionsLabel={t('library.columns.actions')}
      />
    </Stack>
  );
}
