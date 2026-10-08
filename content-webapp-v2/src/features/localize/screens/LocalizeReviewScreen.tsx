import { Alert, Anchor, Button, Flex, Group, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataTableColumn } from '@shared/components/DataTable';
import { DataTable } from '@shared/components/DataTable';
import { StatusBadge } from '@shared/components/StatusBadge';
import { selectValue } from '@shared/utils/select';
import { useLocalizeSites } from '../hooks/useLocalizeSites';
import { useLocalizeReview } from '../hooks/useLocalizeReview';
import type { Segment } from '../utils/segments';

type StageFilter = 'all' | 'pending' | 'approved';

const stageOptions: StageFilter[] = ['all', 'pending', 'approved'];

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

export function LocalizeReviewScreen() {
  const { t } = useTranslation();
  const { sites, languages, languageName } = useLocalizeSites();
  const [siteId, setSiteId] = useState('');
  const [route, setRoute] = useState('');
  const [lang, setLang] = useState('');
  const [stage, setStage] = useState<StageFilter>('pending');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const site = sites.find((s) => s.id === siteId);
  const siteLangCodes = (site?.languages ?? []).filter((l) => l.enabled).map((l) => l.code);
  const langCodes = siteLangCodes.length > 0 ? siteLangCodes : languages.map((l) => l.code);

  const {
    state,
    segments,
    generate,
    generating,
    saveEdit,
    approve,
    approveAll,
    approvingAll,
  } = useLocalizeReview({ siteId, route: route.trim(), lang });

  const isLoading = state.status === 'loading';
  const ready = siteId !== '' && route.trim() !== '' && lang !== '';

  const q = query.trim().toLowerCase();
  const rows = segments.filter(
    (seg) =>
      (stage === 'all' || seg.stage === stage) &&
      (!q || seg.sourceText.toLowerCase().includes(q) || seg.translation.toLowerCase().includes(q)),
  );

  const columns: DataTableColumn<Segment>[] = [
    {
      key: 'source',
      header: t('localize.columns.source'),
      render: (row) => row.sourceText,
    },
    {
      key: 'translation',
      header: t('localize.columns.translation'),
      render: (row) => (
        <TranslationCell
          key={`${row.id}:${lang}`}
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
      <Title order={2}>{t('localize.reviewTitle')}</Title>
      <Text c="dimmed">{t('localize.reviewDescription')}</Text>
      <Flex gap="md" direction={{ base: 'column', md: 'row' }} align={{ base: 'stretch', md: 'flex-end' }}>
        <Select
          aria-label={t('localize.site')}
          placeholder={t('localize.pickSite')}
          value={siteId}
          onChange={(v) => {
            setSiteId(selectValue(v));
            setLang('');
            setPage(1);
          }}
          data={sites.map((s) => ({ value: s.id, label: s.name || s.domain || s.id }))}
        />
        <TextInput
          aria-label={t('localize.page')}
          placeholder={t('localize.routePlaceholder')}
          value={route}
          onChange={(e) => {
            setRoute(e.currentTarget.value);
            setPage(1);
          }}
          miw="min(220px, 100%)"
        />
        <Select
          aria-label={t('localize.language')}
          placeholder={t('localize.pickLanguage')}
          value={lang}
          onChange={(v) => {
            setLang(selectValue(v));
            setPage(1);
          }}
          data={langCodes.map((code) => ({ value: code, label: languageName(code) }))}
        />
        <Select
          aria-label={t('localize.statusFilter')}
          value={stage}
          onChange={(v) => {
            setStage(selectValue(v, 'pending'));
            setPage(1);
          }}
          data={stageOptions.map((v) => ({ value: v, label: t(`localize.statusOptions.${v}`) }))}
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
      <Group gap="md">
        <Button
          variant="outline"
          disabled={!ready || generating}
          loading={generating}
          onClick={() => generate()}
        >
          {generating ? t('localize.generating') : t('localize.generate')}
        </Button>
        <Button disabled={!ready || approvingAll} loading={approvingAll} onClick={() => approveAll()}>
          {t('localize.approveAll')}
        </Button>
      </Group>
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {!siteId && !isLoading && <Text c="dimmed">{t('localize.pickSiteFirst')}</Text>}
      {ready && !isLoading && segments.length === 0 && state.status !== 'error' && (
        <Text c="dimmed">{t('localize.generateHint')}</Text>
      )}
      <DataTable<Segment>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={isLoading}
        page={page}
        pageSize={10}
        onPageChange={setPage}
        emptyMessage={t('localize.reviewEmpty')}
        actions={(row) =>
          row.stage !== 'approved' && (
            <Anchor component="button" type="button" fw={700} onClick={() => approve(row.id)}>
              {t('localize.approve')}
            </Anchor>
          )
        }
        actionsLabel={t('localize.columns.actions')}
      />
    </Stack>
  );
}
