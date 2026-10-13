import { Alert, Anchor, Badge, Button, Chip, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { CONTENT_UI } from '../types/content.types';
import type { ContentItem } from '../types/content.types';
import type { Course } from '../api/library';
import { useLibrary } from '../hooks/useLibrary';

const experiences = ['poem', 'story', 'quiz', 'lesson', 'course', 'audio', 'song', 'textbook', 'webpage'];

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
  rowKey: string;
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function contentRow(item: ContentItem): LibraryRow {
  const uploaded = [item.is_teacher_app && 'TA', (item.is_pull_model || CONTENT_UI[item.type].preview === 'quiz') && 'IVR']
    .filter(Boolean)
    .join(', ');
  return {
    id: item.id,
    title: item.title.english,
    subtitle: item.title.local,
    theme: item.theme.english,
    themeSub: item.theme.local,
    uploaded,
    language: languageName(item.language),
    kind: item.type,
    isCourse: false,
    rowKey: `content:${item.id}`,
  };
}

function courseRow(course: Course): LibraryRow {
  return {
    id: course.id,
    title: course.name,
    subtitle: course.number,
    theme: course.org,
    themeSub: '',
    uploaded: course.synced ? 'Synced' : 'Never synced',
    language: languageName(course.language),
    kind: 'course',
    isCourse: true,
    rowKey: `course:${course.id}`,
  };
}

export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state, content, courses, reload, removeContent, removeCourse, syncAll, syncingAll, refreshIvr } =
    useLibrary();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const isLoading = state.status === 'loading';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...content.map(contentRow), ...courses.map(courseRow)].filter(
      (row) =>
        (selected.length === 0 || selected.includes(row.kind)) &&
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
      onConfirm: () => void remove(row),
    });
  };

  const remove = (row: LibraryRow) => {
    if (row.isCourse) return removeCourse(row.id);
    return removeContent(row.id);
  };

  const openRow = (row: LibraryRow) => {
    if (row.isCourse) return navigate({ to: '/library/course/$id', params: { id: row.id } });
    return navigate({ to: '/library/$kind/$id', params: { kind: row.kind, id: row.id } });
  };

  const columns: DataTableColumn<LibraryRow>[] = [
    {
      key: 'title',
      header: t('library.columns.title'),
      render: (row) => (
        <Stack gap={0}>
          <Text size="sm" fw={700}>{row.title}</Text>
          {row.subtitle && (
            <Text size="xs" c="dimmed">
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
          <Text size="sm">{row.theme}</Text>
          {row.themeSub && (
            <Text size="sm" c="dimmed">
              {row.themeSub}
            </Text>
          )}
        </Stack>
      ),
    },
    { key: 'kind', header: t('library.columns.kind'), render: (row) => <Text size="sm">{t(`library.experiences.${row.kind}`)}</Text> },
    {
      key: 'language',
      header: t('library.columns.language'),
      render: (row) =>
        row.language && (
          <Badge variant="light" color="gray" radius="xl">
            {row.language}
          </Badge>
        ),
    },
    { key: 'uploaded', header: t('library.columns.uploaded'), render: (row) => <Text size="sm">{row.uploaded}</Text> },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap="xs">
          <Title order={2}>{t('library.title')}</Title>
          <Text>{t('library.description')}</Text>
        </Stack>
        <Group gap="md">
          <Button variant="subtle" onClick={() => void refreshIvr()}>
            {t('library.updateIvr')}
          </Button>
          <Button variant="subtle" component={Link} to={'/ivr-view'}>
            {t('library.viewIvr')}
          </Button>
          <Button variant="outline" loading={syncingAll} onClick={() => void syncAll()}>
            {t('library.syncAll')}
          </Button>
          <Button leftSection={<Plus size={16} aria-hidden />} component={Link} to={'/create'}>
            {t('library.addContent')}
          </Button>
        </Group>
      </Group>
      <Text variant="eyebrow">{t('library.filterContent')}</Text>
      <TextInput
        aria-label={t('library.search')}
        placeholder={t('library.search')}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <Text variant="eyebrow">{t('library.experience')}</Text>
      <Group gap="xs" aria-label={t('library.experience')}>
        <Chip checked={selected.length === 0} onChange={() => setSelected([])}>
          {t('library.all')}
        </Chip>
        <Chip.Group multiple value={selected} onChange={setSelected}>
          {experiences.map((exp) => (
            <Chip key={exp} value={exp}>
              {t(`library.experiences.${exp}`)}
            </Chip>
          ))}
        </Chip.Group>
      </Group>
      {state.status === 'error' && (
        <Alert>
          <Group gap="xs">
            {state.error.message}
            <Button variant="subtle" size="sm" onClick={() => reload()}>
              {t('library.retry')}
            </Button>
          </Group>
        </Alert>
      )}
      <DataTable<LibraryRow>
        footerLayout="pages"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.rowKey}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('library.empty')}
        actions={(row) => (
          <Group gap="sm" wrap="nowrap">
            <Anchor component="button" type="button" fw={700} onClick={() => void openRow(row)}>
              {t('library.view')}
            </Anchor>
            {!row.isCourse && (
              <Anchor
                component="button"
                type="button"
                fw={700}
                onClick={() =>
                  void navigate({ to: '/library/$kind/$id/edit', params: { kind: row.kind, id: row.id } })
                }
              >
                {t('library.edit')}
              </Anchor>
            )}
            <Anchor component="button" type="button" fw={700} c="red" onClick={() => confirmRemove(row)}>
              {t('library.delete')}
            </Anchor>
          </Group>
        )}
        actionsLabel={t('library.columns.actions')}
      />
    </Stack>
  );
}
