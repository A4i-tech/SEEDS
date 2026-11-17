import { Alert, Anchor, Button, Flex, Group, Select, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Search } from 'lucide-react';
import { readLocalStorageValue } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import type { DataTableColumn } from '@shared/components/DataTable';
import { BackLink } from '@shared/components/BackLink';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { ApiError } from '@shared/services/apiClient';
import { selectValue } from '@shared/utils/select';
import { SourceText } from '../components/SourceText';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import { useLocalizePages } from '../hooks/useLocalizePages';
import { useLocalizeReview } from '../hooks/useLocalizeReview';
import type { Segment } from '../utils/segments';
import { PageTitle } from '@shared/components/PageTitle';
import { text } from '@shared/utils/schema';

type StageFilter = 'all' | 'pending' | 'approved';

const stageOptions: StageFilter[] = ['pending', 'approved', 'all'];

const STAGE_TONE = { approved: 'done', pending: 'needs-review' } as const;

function TranslationCell({ seg, onSave }: { seg: Segment; onSave: (id: string, text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(seg.translation);
  const commit = () => {
    if (text !== seg.translation) onSave(seg.id, text);
  };
  return (
    <Stack gap={4}>
      <Textarea
        autosize
        minRows={2}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        aria-label={t('localize.columns.translation')}
      />
      {seg.lowConfidence && (
        <Text size="xs" c="dimmed">
          {t('localize.lowConfidence')}
        </Text>
      )}
    </Stack>
  );
}

const prefillSchema = z.object({ siteId: text, route: text, lang: text });

const SCOPE_KEY = 'seeds-localize-scope';
const EMPTY_SCOPE = { siteId: '', route: '', lang: '' };

export function LocalizeReviewScreen() {
  const { t } = useTranslation();
  const { sites, languages, languageName } = useLocalizeSites();
  const prefill = prefillSchema.parse(useSearch({ strict: false }));
  const [scope, setScope] = useState(() => {
    if (prefill.siteId) return prefill;
    return readLocalStorageValue({ key: SCOPE_KEY, defaultValue: EMPTY_SCOPE });
  });
  const [stage, setStage] = useState<StageFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
  }, [scope]);

  const site = sites.find((s) => s.site_id === scope.siteId) ?? sites[0];
  const siteId = site?.site_id ?? '';
  const siteLangCodes = (site?.languages ?? []).filter((l) => l.enabled).map((l) => l.code);
  const langCodes = siteLangCodes.length > 0 ? siteLangCodes : languages.map((l) => l.code);
  const lang = langCodes.includes(scope.lang) ? scope.lang : (langCodes[0] ?? '');

  const { state: pagesState, pages } = useLocalizePages(siteId);
  const activeRoute = pages.includes(scope.route) ? scope.route : (pages[0] ?? '');

  const {
    state,
    segments,
    generating,
    saveEdit,
    approve,
    approveAll,
    approvingAll,
  } = useLocalizeReview({ siteId, route: activeRoute, lang });

  const counts = {
    pending: segments.filter((seg) => seg.stage === 'pending').length,
    approved: segments.filter((seg) => seg.stage === 'approved').length,
    all: segments.length,
  };

  const isLoading =
    generating ||
    (siteId !== '' && pagesState.status === 'loading') || (siteId !== '' && activeRoute !== '' && state.status === 'loading');
  const ready = siteId !== '' && activeRoute !== '' && lang !== '';

  const q = query.trim().toLowerCase();
  const rows = segments.filter(
    (seg) =>
      (stage === 'all' || seg.stage === stage) &&
      (!q || seg.sourceText.toLowerCase().includes(q) || seg.translation.toLowerCase().includes(q)),
  );

  const errorMessage = (error: Error) =>
    error instanceof ApiError && error.status === 403 ? t('localize.permissionDenied') : error.message;

  const approveVisible = () => {
    const ids = rows.filter((seg) => seg.stage === 'pending' && seg.translation !== '').map((seg) => seg.id);
    if (ids.length === 0) {
      notifications.show({ message: t('localize.nothingToApprove') });
      return;
    }
    openConfirmDialog({
      title: t('localize.approveAllTitle'),
      confirmLabel: t('localize.approveAll'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => approveAll({ ids, whole: stage === 'all' && q === '' }),
    });
  };

  const columns: DataTableColumn<Segment>[] = [
    {
      key: 'source',
      header: t('localize.columns.source'),
      render: (row) => <SourceText text={row.sourceText} />,
    },
    {
      key: 'translation',
      header: t('localize.columns.translation'),
      render: (row) => (
        <TranslationCell
          key={`${row.id}:${lang}:${row.translation}`}
          seg={row}
          onSave={(id, text) => saveEdit({ id, text })}
        />
      ),
    },
    {
      key: 'status',
      header: t('localize.columns.status'),
      render: (row) => (
        <StatusBadge
          tone={STAGE_TONE[row.stage]}
          label={t(`localize.stageOptions.${row.stage}`)}
        />
      ),
    },
  ];

  return (
    <Stack gap="md">
      <BackLink to="/localize" label={t('nav.localize')} current={site ? site.name || site.domain : undefined} />
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap="xs">
          <PageTitle title={t('localize.reviewTitle')} />
          <Text c="dimmed">{t('localize.reviewDescription')}</Text>
        </Stack>
        <Button disabled={!ready || approvingAll} loading={approvingAll} onClick={approveVisible}>
          {t('localize.approveAll')}
        </Button>
      </Group>
      <Flex gap="md" direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'flex-end' }}>
        <Select
          aria-label={t('localize.site')}
          placeholder={t('localize.pickSite')}
          value={siteId}
          onChange={(v) => {
            setScope({ siteId: selectValue(v), route: '', lang: '' });
            setPage(1);
          }}
          data={sites.map((s) => ({ value: s.site_id, label: s.name || s.domain || s.site_id }))}
        />
        <Select
          aria-label={t('localize.page')}
          placeholder={t('localize.pickPage')}
          value={activeRoute}
          onChange={(v) => {
            setScope({ siteId, route: selectValue(v), lang });
            setPage(1);
          }}
          data={pages}
          searchable
        />
        <Select
          aria-label={t('localize.language')}
          placeholder={t('localize.pickLanguage')}
          value={lang}
          onChange={(v) => {
            setScope({ siteId, route: activeRoute, lang: selectValue(v) });
            setPage(1);
          }}
          data={langCodes.map((code) => ({ value: code, label: languageName(code) }))}
        />
        <TextInput
          aria-label={t('localize.reviewSearch')}
          placeholder={t('localize.reviewSearch')}
          leftSection={<Search size={16} aria-hidden />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          flex={1}
          miw="min(240px, 100%)"
        />
      </Flex>
      <Tabs
        value={stage}
        onChange={(v) => {
          setStage(selectValue(v, 'pending'));
          setPage(1);
        }}
      >
        <Tabs.List>
          {stageOptions.map((v) => (
            <Tabs.Tab key={v} value={v}>
              {t(`localize.stageOptions.${v}`)} ({counts[v]})
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {pagesState.status === 'error' && <Alert>{errorMessage(pagesState.error)}</Alert>}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {!siteId && !isLoading && <Text c="dimmed">{t('localize.pickSiteFirst')}</Text>}
      <DataTable<Segment>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyMessage={t('localize.reviewEmpty')}
        actions={(row) =>
          row.stage !== 'approved' && (
            <Group gap="md" wrap="nowrap">
              <Anchor component="button" type="button" variant="rowAction" onClick={() => approve(row.id)}>
                {t('localize.approve')}
              </Anchor>
            </Group>
          )
        }
        actionsLabel={t('localize.columns.actions')}
      />
    </Stack>
  );
}
