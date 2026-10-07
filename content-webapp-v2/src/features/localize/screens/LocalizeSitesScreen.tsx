import { Button, Code, Group, Modal, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { API_BASE_URL } from '@/config/env';
import { routePaths } from '@app/navigation/routePaths';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import type { Website } from '../types/localize.types';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import classes from './LocalizeSitesScreen.module.css';

type SiteStatusFilter = 'all' | 'Active' | 'Inactive';

const statusOptions: SiteStatusFilter[] = ['all', 'Active', 'Inactive'];

interface SiteRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  languages: string;
  siteId: string;
  apiBase: string;
}

function toRow(site: Website): SiteRow {
  return {
    id: site.id,
    name: site.name ?? '',
    domain: site.domain ?? '',
    status: site.status ?? '',
    languages: (site.languages ?? []).map((l) => l.code).join(', '),
    siteId: site.site_id ?? '',
    apiBase: site.api_base ?? API_BASE_URL,
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
  const { sites, isLoading, error, remove } = useLocalizeSites();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [snippetRow, setSnippetRow] = useState<SiteRow | null>(null);
  const loadError = toApiErrorMessage(error);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.map(toRow).filter(
      (row) =>
        (statusFilter === 'all' || row.status === statusFilter) &&
        (!q || row.name.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q)),
    );
  }, [sites, query, statusFilter]);

  const copySnippet = async (snippet: string) => {
    await navigator.clipboard.writeText(snippet);
    notifications.show({ message: t('localize.copied') });
  };

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
        <Stack gap={0}>
          <Text fw={700}>{row.name || row.domain}</Text>
          {row.name && (
            <Text size="sm" c="dimmed">
              {row.domain}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: 'status',
      header: t('localize.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'Active' ? 'done' : 'failed'} label={row.status} />
      ),
    },
    { key: 'languages', header: t('localize.columns.languages'), render: (row) => row.languages },
  ];

  return (
    <Stack gap="md">
      <Title order={2}>{t('localize.title')}</Title>
      <Text c="dimmed">{t('localize.description')}</Text>
      <Group gap="md">
        <Button className={classes.submitButton} onClick={() => void navigate(routePaths.localizeAdd)}>
          {t('localize.addSite')}
        </Button>
        <Button
          variant="outline"
          className={classes.secondaryButton}
          onClick={() => void navigate(routePaths.localizeReview)}
        >
          {t('localize.reviewTranslations')}
        </Button>
      </Group>
      <Group gap="md" className={classes.filters}>
        <Select
          aria-label={t('localize.columns.status')}
          value={statusFilter}
          onChange={(v) => setStatusFilter((v as SiteStatusFilter) ?? 'all')}
          data={statusOptions.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
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
          <Group gap="xs">
            <button
              type="button"
              className={classes.rowAction}
              onClick={() => void navigate(`${routePaths.localize}/sites/${row.id}/edit`)}
            >
              {t('localize.edit')}
            </button>
            <button
              type="button"
              className={classes.rowAction}
              onClick={() => setSnippetRow(row)}
            >
              {t('localize.viewSnippet')}
            </button>
            <button type="button" className={classes.rowAction} onClick={() => confirmRemove(row)}>
              {t('localize.delete')}
            </button>
          </Group>
        )}
        actionsLabel={t('localize.columns.actions')}
      />
      <Modal
        opened={snippetRow !== null}
        onClose={() => setSnippetRow(null)}
        title={snippetRow ? t('localize.snippetTitle', { name: snippetRow.name || snippetRow.domain }) : ''}
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
