import {
  Alert,
  Anchor,
  Button,
  Flex,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { formatRelativeTime } from '@shared/utils/format';
import { selectValue } from '@shared/utils/select';
import type { Website } from '../types/localize.types';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import { sdkSnippet, devToolsSnippet } from '../utils/siteSnippets';
import { SiteSnippetModal } from '../components/SiteSnippetModal';
import classes from './LocalizeSitesScreen.module.css';

type SiteStatusFilter = 'all' | 'Active' | 'Inactive';

const statusOptions: SiteStatusFilter[] = ['all', 'Active', 'Inactive'];

const VISIBLE_LANGUAGES = 2;

function LanguageBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  if (enabled) return <StatusBadge tone="done" label={t('localize.languageEnabled')} />;
  return <StatusBadge tone="failed" label={t('localize.languageDisabled')} />;
}

export function LocalizeSitesScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sites, languages, languageName, isLoading, error, remove } = useLocalizeSites();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [snippetId, setSnippetId] = useState('');
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter(
      (row) =>
        (statusFilter === 'all' || row.status === statusFilter) &&
        (languageFilter === 'all' || row.languages.some((l) => l.code === languageFilter)) &&
        (!q || row.name.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q)),
    );
  }, [sites, query, statusFilter, languageFilter]);

  const snippetRow = rows.find((row) => row.id === snippetId);

  const siteDisplayName = (site: Website) => site.name || site.domain;
  const snippetTitle = snippetRow && t('localize.snippetTitle', { name: siteDisplayName(snippetRow) });
  const sdkCode = snippetRow
    ? sdkSnippet(snippetRow.site_id, snippetRow.api_base, window.location.origin)
    : undefined;
  const devToolsCode = snippetRow
    ? devToolsSnippet(snippetRow.site_id, snippetRow.api_base, window.location.origin)
    : undefined;

  const openSite = (row: Website) =>
    void navigate({ to: '/localize/sites/$siteId/edit', params: { siteId: row.id } });

  const confirmRemove = (row: Website) => {
    openConfirmDialog({
      title: t('localize.deleteTitle'),
      body: t('localize.deleteBody', { name: siteDisplayName(row) }),
      confirmLabel: t('localize.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => remove(row.id),
    });
  };

  const columns: DataTableColumn<Website>[] = [
    {
      key: 'site',
      header: t('localize.columns.site'),
      render: (row) => (
        <Stack gap={4}>
          <Text fw={700}>{row.domain}</Text>
          {(row.name || row.status === 'Inactive') && (
            <Text size="sm" c="dimmed">
              {[row.name, row.status === 'Inactive' && t('localize.statusOptions.Inactive')].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: 'languages',
      header: t('localize.columns.languages'),
      render: (row) => (
        <Group gap="xs">
          {row.languages.slice(0, VISIBLE_LANGUAGES).map((l) => (
            <Paper key={l.code} p="xs" radius="sm">
              <Stack gap={4}>
                <Text size="xs" fw={700}>
                  {languageName(l.code)}
                </Text>
                <LanguageBadge enabled={l.enabled} />
              </Stack>
            </Paper>
          ))}
          {row.languages.length > VISIBLE_LANGUAGES && (
            <UnstyledButton
              p="xs"
              bdrs="sm"
              ta="left"
              className={classes.moreButton}
              onClick={() => openSite(row)}
            >
              <Text size="xs" fw={700} c="seeds">
                {t('localize.moreLanguages', { count: row.languages.length - VISIBLE_LANGUAGES })}
              </Text>
              <Text size="xs" c="dimmed">
                {t('localize.viewAll')}
              </Text>
            </UnstyledButton>
          )}
        </Group>
      ),
    },
    {
      key: 'updated',
      header: t('localize.columns.updated'),
      render: (row) => (
        <Text size="sm" c="dimmed">
          {formatRelativeTime(row.updated_at)}
        </Text>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap="xs">
          <Title order={2}>{t('localize.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('localize.description')}
          </Text>
        </Stack>
        <Group gap="md">
          <Button variant="outline" onClick={() => void navigate({ to: routePaths.localizeReview })}>
            {t('localize.reviewTranslations')}
          </Button>
          <Button
            leftSection={<Plus size={16} aria-hidden />}
            onClick={() => void navigate({ to: routePaths.localizeAdd })}
          >
            {t('localize.addSite')}
          </Button>
        </Group>
      </Group>
      <Flex gap="md" direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'flex-end' }}>
        <Select
          aria-label={t('localize.columns.status')}
          value={statusFilter}
          onChange={(v) => setStatusFilter(selectValue(v, 'all'))}
          data={statusOptions.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
        />
        <Select
          aria-label={t('localize.columns.languages')}
          value={languageFilter}
          onChange={(v) => setLanguageFilter(selectValue(v, 'all'))}
          data={[{ value: 'all', label: t('localize.allLanguages') }, ...languages.map((l) => ({ value: l.code, label: l.name }))]}
        />
        <TextInput
          aria-label={t('localize.search')}
          placeholder={t('localize.search')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          flex={1}
          miw="min(240px, 100%)"
        />
      </Flex>
      {loadError && <Alert>{loadError}</Alert>}
      <DataTable<Website>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('localize.empty')}
        actions={(row) => (
          <Group gap="md" wrap="nowrap">
            <Anchor component="button" type="button" fw={700} onClick={() => openSite(row)}>
              {t('localize.open')}
            </Anchor>
            <Anchor component="button" type="button" fw={700} onClick={() => setSnippetId(row.id)}>
              {t('localize.viewSnippet')}
            </Anchor>
            <Anchor component="button" type="button" fw={700} onClick={() => confirmRemove(row)}>
              {t('localize.delete')}
            </Anchor>
          </Group>
        )}
        actionsLabel=""
      />
      <Button
        variant="outline"
        fullWidth
        h={48}
        className={classes.addButton}
        onClick={() => void navigate({ to: routePaths.localizeAdd })}
      >
        + {t('localize.addSite')}
      </Button>
      <SiteSnippetModal
        opened={snippetRow !== undefined}
        title={snippetTitle}
        sdkCode={sdkCode}
        devToolsCode={devToolsCode}
        onClose={() => setSnippetId('')}
      />
    </Stack>
  );
}
