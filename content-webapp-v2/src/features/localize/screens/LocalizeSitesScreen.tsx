import { Button, Code, Group, Modal, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { API_BASE_URL } from '@/config/env';
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
import classes from './LocalizeSitesScreen.module.css';

type SiteStatusFilter = 'all' | 'Active' | 'Inactive';

const statusOptions: SiteStatusFilter[] = ['all', 'Active', 'Inactive'];

const VISIBLE_LANGUAGES = 2;

interface SiteRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  languages: { code: string; enabled: boolean }[];
  updatedAt: string;
  siteId: string;
  apiBase: string;
}

function LanguageBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  if (enabled) return <StatusBadge tone="done" label={t('localize.languageEnabled')} />;
  return <StatusBadge tone="failed" label={t('localize.languageDisabled')} />;
}

function toRow(site: Website): SiteRow {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    status: site.status,
    languages: site.languages,
    updatedAt: site.updated_at,
    siteId: site.site_id,
    apiBase: site.api_base || API_BASE_URL,
  };
}

function sdkSnippet(row: SiteRow): string {
  return [
    '<script',
    `  src="${window.location.origin}/sdk.js"`,
    `  data-site-id="${row.siteId}"`,
    `  data-api-base="${row.apiBase}"`,
    '  defer>',
    '</script>',
  ].join('\n');
}

function devToolsSnippet(row: SiteRow): string {
  return [
    'const s = document.createElement("script");',
    `s.src = "${window.location.origin}/sdk.js";`,
    `s.dataset.siteId = "${row.siteId}";`,
    `s.dataset.apiBase = "${row.apiBase}";`,
    'document.body.appendChild(s);',
  ].join('\n');
}

export function LocalizeSitesScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sites, languages, isLoading, error, remove } = useLocalizeSites();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [snippetId, setSnippetId] = useState('');
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.map(toRow).filter(
      (row) =>
        (statusFilter === 'all' || row.status === statusFilter) &&
        (languageFilter === 'all' || row.languages.some((l) => l.code === languageFilter)) &&
        (!q || row.name.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q)),
    );
  }, [sites, query, statusFilter, languageFilter]);

  const snippetRow = rows.find((row) => row.id === snippetId);

  const snippetTitle = snippetRow && t('localize.snippetTitle', { name: snippetRow.name || snippetRow.domain });

  const copySnippet = async (snippet: string) => {
    await navigator.clipboard.writeText(snippet);
    notifications.show({ message: t('localize.copied') });
  };

  const languageName = (code: string) => languages.find((l) => l.code === code)?.name ?? code;

  const openSite = (row: SiteRow) =>
    void navigate({ to: '/localize/sites/$siteId/edit', params: { siteId: row.id } });

  const confirmRemove = (row: SiteRow) => {
    openConfirmDialog({
      title: t('localize.deleteTitle'),
      body: t('localize.deleteBody', { name: row.name || row.domain }),
      confirmLabel: t('localize.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => void remove(row.id),
    });
  };

  const columns: DataTableColumn<SiteRow>[] = [
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
            <Stack key={l.code} gap={4} className={classes.chip}>
              <Text size="xs" fw={700}>
                {languageName(l.code)}
              </Text>
              <LanguageBadge enabled={l.enabled} />
            </Stack>
          ))}
          {row.languages.length > VISIBLE_LANGUAGES && (
            <button type="button" className={`${classes.chip} ${classes.moreChip}`} onClick={() => openSite(row)}>
              <Text size="xs" fw={700} className={classes.moreCount}>
                {t('localize.moreLanguages', { count: row.languages.length - VISIBLE_LANGUAGES })}
              </Text>
              <Text size="xs" c="dimmed">
                {t('localize.viewAll')}
              </Text>
            </button>
          )}
        </Group>
      ),
    },
    {
      key: 'updated',
      header: t('localize.columns.updated'),
      render: (row) => (
        <Text size="sm" c="dimmed">
          {formatRelativeTime(row.updatedAt)}
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
          <Button
            variant="outline"
            className={classes.secondaryButton}
            onClick={() => void navigate({ to: routePaths.localizeReview })}
          >
            {t('localize.reviewTranslations')}
          </Button>
          <Button
            className={classes.submitButton}
            leftSection={<Plus size={16} aria-hidden />}
            onClick={() => void navigate({ to: routePaths.localizeAdd })}
          >
            {t('localize.addSite')}
          </Button>
        </Group>
      </Group>
      <Group gap="md" className={classes.filters}>
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
          className={classes.search}
        />
      </Group>
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      <DataTable<SiteRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        footerLayout="range"
        emptyMessage={t('localize.empty')}
        actions={(row) => (
          <Group gap="md" wrap="nowrap">
            <button type="button" className={classes.rowAction} onClick={() => openSite(row)}>
              {t('localize.open')}
            </button>
            <button
              type="button"
              className={classes.rowAction}
              onClick={() => setSnippetId(row.id)}
            >
              {t('localize.viewSnippet')}
            </button>
            <button type="button" className={classes.rowAction} onClick={() => confirmRemove(row)}>
              {t('localize.delete')}
            </button>
          </Group>
        )}
        actionsLabel=""
      />
      <Button
        variant="outline"
        fullWidth
        className={classes.addDashed}
        onClick={() => void navigate({ to: routePaths.localizeAdd })}
      >
        + {t('localize.addSite')}
      </Button>
      <Modal
        opened={snippetRow !== undefined}
        onClose={() => setSnippetId('')}
        title={snippetTitle}
        centered
      >
        {snippetRow && (
          <Stack gap="md">
            <Code block>{sdkSnippet(snippetRow)}</Code>
            <Button variant="subtle" size="xs" onClick={() => void copySnippet(sdkSnippet(snippetRow))}>
              {t('localize.copy')}
            </Button>
            <Text fw={700}>{t('localize.devtools')}</Text>
            <Text size="sm" c="dimmed">
              {t('localize.devtoolsHint')}
            </Text>
            <Code block>{devToolsSnippet(snippetRow)}</Code>
            <Button variant="subtle" size="xs" onClick={() => void copySnippet(devToolsSnippet(snippetRow))}>
              {t('localize.copy')}
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
