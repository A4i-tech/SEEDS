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
  UnstyledButton,
} from '@mantine/core';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { formatRelativeTime } from '@shared/utils/format';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { selectValue } from '@shared/utils/select';
import { getSite } from '../api/sites';
import type { Website } from '../types/localize.types';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import { sdkSnippet, devToolsSnippet } from '../utils/siteSnippets';
import { SiteSnippetModal } from '../components/SiteSnippetModal';
import classes from './LocalizeSitesScreen.module.css';
import { PageTitle } from '@shared/components/PageTitle';
import { RowActions } from '@shared/components/RowActions';

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
  const { state, sites, languages, languageName, remove } = useLocalizeSites();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [snippetRow, setSnippetRow] = useState<Website | null>(null);
  const isLoading = state.status === 'loading';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter(
      (row) =>
        (statusFilter === 'all' || row.status === statusFilter) &&
        (languageFilter === 'all' || row.languages.some((l) => l.code === languageFilter)) &&
        (!q || row.name.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q)),
    );
  }, [sites, query, statusFilter, languageFilter]);

  const openSnippet = (row: Website) => getSite(row.id).then(setSnippetRow, notifyApiError);

  const siteDisplayName = (site: Website) => site.name || site.domain;

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
          <Text variant="rowTitle">{row.domain}</Text>
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
                <Text size="xs" variant="rowTitle">
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
              <Text size="xs" variant="rowAction" c="seeds">
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
          <PageTitle title={t('localize.title')} />
          <Text size="sm" c="dimmed">
            {t('localize.description')}
          </Text>
        </Stack>
        <Group gap="md">
          <Button
            leftSection={<Plus size={16} aria-hidden />}
            onClick={() => void navigate({ to: '/localize/add' })}
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
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
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
          <RowActions>
            <Anchor component="button" type="button" variant="rowAction" onClick={() => openSite(row)}>
              {t('localize.open')}
            </Anchor>
            <Anchor component="button" type="button" variant="rowAction" onClick={() => void openSnippet(row)}>
              {t('localize.viewSnippet')}
            </Anchor>
            <Anchor
              component="button"
              type="button"
              variant="rowAction"
              onClick={() => void navigate({ to: '/localize/review', search: { siteId: row.id } })}
            >
              {t('localize.reviewSite')}
            </Anchor>
            <Anchor component="button" type="button" variant="rowAction" c="red" onClick={() => confirmRemove(row)}>
              {t('localize.delete')}
            </Anchor>
          </RowActions>
        )}
        actionsLabel=""
      />
      <Button
        variant="outline"
        fullWidth
        h={48}
        className={classes.addButton}
        onClick={() => void navigate({ to: '/localize/add' })}
      >
        + {t('localize.addSite')}
      </Button>
      {snippetRow && (
        <SiteSnippetModal
          title={t('localize.snippetTitle', { name: siteDisplayName(snippetRow) })}
          sdkCode={sdkSnippet(snippetRow.site_id, snippetRow.api_base, window.location.origin)}
          devToolsCode={devToolsSnippet(snippetRow.site_id, snippetRow.api_base, window.location.origin)}
          onClose={() => setSnippetRow(null)}
        />
      )}
    </Stack>
  );
}
