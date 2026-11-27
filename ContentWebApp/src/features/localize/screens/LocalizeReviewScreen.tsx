import { Alert, Anchor, Button, Flex, Group, Select, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Search } from 'lucide-react';
import { useLocalStorage } from '@mantine/hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import type { DataTableColumn } from '@shared/components/DataTable';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { ApiError } from '@shared/services/apiClient';
import { selectValue } from '@shared/utils/select';
import { RulesModal } from '../components/RulesModal';
import { SourceText } from '../components/SourceText';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import { useLocalizePages } from '../hooks/useLocalizePages';
import { useLocalizeReview } from '../hooks/useLocalizeReview';
import { useLocalizeRules } from '../hooks/useLocalizeRules';
import type { ReviewScope, Website } from '../types/localize.types';
import type { Segment } from '../utils/segments';
import { PageTitle } from '@shared/components/PageTitle';

type StageFilter = 'all' | 'pending' | 'approved' | 'excluded' | 'overridden';

const stageOptions: StageFilter[] = ['pending', 'approved', 'all', 'excluded', 'overridden'];

const STAGE_TONE = { approved: 'done', pending: 'needs-review', excluded: 'neutral', overridden: 'done' } as const;

const inAll = (seg: Segment) => seg.stage === 'pending' || seg.stage === 'approved';

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
        disabled={!inAll(seg)}
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

const SCOPE_KEY = 'seeds-localize-scope';
const EMPTY_SCOPE: ReviewScope = { siteId: '', route: '', lang: '' };

interface SiteReviewProps {
  site: Website;
  sites: Website[];
  languages: { code: string }[];
  languageName: (code: string) => string;
  scope: ReviewScope;
  setScope: (scope: ReviewScope) => void;
}

export function LocalizeReviewScreen() {
  const { t } = useTranslation();
  const { state: sitesState, sites, languages, languageName } = useLocalizeSites();
  const prefill = useSearch({ strict: false });
  const [stored, setStored] = useLocalStorage({ key: SCOPE_KEY, defaultValue: EMPTY_SCOPE, getInitialValueInEffect: false });
  const [scope, setCurrent] = useState(prefill.siteId ? prefill : stored);
  const setScope = (next: ReviewScope) => {
    setCurrent(next);
    setStored(next);
  };
  const site = sites.find((s) => s.site_id === scope.siteId) ?? sites[0];

  if (sitesState.status === 'loading') return <Text c="dimmed">{t('common.loading')}</Text>;
  if (!site) return <Text c="dimmed">{t('localize.pickSiteFirst')}</Text>;
  return (
    <SiteReview site={site} sites={sites} languages={languages} languageName={languageName} scope={scope} setScope={setScope} />
  );
}

function SiteReview({ site, sites, languages, languageName, scope, setScope }: SiteReviewProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<StageFilter>('all');
  const [query, setQuery] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const siteId = site.site_id;
  const siteLangCodes = site.languages.filter((l) => l.enabled).map((l) => l.code);
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

  const rules = useLocalizeRules(siteId);

  const counts = {
    pending: segments.filter((seg) => seg.stage === 'pending').length,
    approved: segments.filter((seg) => seg.stage === 'approved').length,
    all: segments.filter(inAll).length,
    excluded: segments.filter((seg) => seg.stage === 'excluded').length,
    overridden: segments.filter((seg) => seg.stage === 'overridden').length,
  };

  const isLoading = generating || pagesState.status === 'loading' || (activeRoute !== '' && state.status === 'loading');
  const ready = activeRoute !== '' && lang !== '';

  const q = query.trim().toLowerCase();
  const rows = segments.filter(
    (seg) =>
      (stage === 'all' ? inAll(seg) : seg.stage === stage) &&
      (!q || seg.sourceText.toLowerCase().includes(q) || seg.translation.toLowerCase().includes(q)),
  );

  const langOptions = langCodes.map((code) => ({ value: code, label: languageName(code) }));

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
      body: t('localize.approveAllBody'),
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
        <Stack gap={4} align="flex-start">
          <StatusBadge tone={STAGE_TONE[row.stage]} label={t(`localize.stageOptions.${row.stage}`)} />
          {row.stage === 'excluded' && (
            <Text size="xs" c="dimmed">
              {row.pattern}
            </Text>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <AppBreadcrumbs
        crumbs={[{ label: t('nav.localize'), to: '/localize' }, { label: site.name || site.domain }]}
      />
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap="xs">
          <PageTitle title={t('localize.reviewTitle')} />
          <Text c="dimmed">{t('localize.reviewDescription')}</Text>
        </Stack>
        <Group gap="sm">
          <Button variant="outline" disabled={siteId === ''} onClick={() => setRulesOpen(true)}>
            {t('localize.rules')}
          </Button>
          <Button disabled={!ready || approvingAll} loading={approvingAll} onClick={approveVisible}>
            {t('localize.approveAll')}
          </Button>
        </Group>
      </Group>
      {rulesOpen && (
        <RulesModal
          rules={rules}
          languages={langOptions}
          languageName={languageName}
          errorMessage={errorMessage}
          onClose={() => setRulesOpen(false)}
        />
      )}
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
          data={langOptions}
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
          row.stage === 'pending' && (
            <Anchor component="button" type="button" variant="rowAction" onClick={() => approve(row.id)}>
              {t('localize.approve')}
            </Anchor>
          )
        }
        actionsLabel={t('localize.columns.actions')}
      />
    </Stack>
  );
}
