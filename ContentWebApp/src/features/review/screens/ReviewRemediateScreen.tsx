import { Alert, Button, Grid, Group, Pagination, Stack, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useBlocker, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useReviewRemediate } from '../hooks/useReviewRemediate';
import { useSyncedScroll } from '../hooks/useSyncedScroll';
import { DraftPage } from '../components/DraftPage';
import { OriginalScan } from '../components/OriginalScan';
import { ReviewFrame } from '../components/ReviewFrame';
import { RunDetails } from '../components/RunDetails';
import { DownloadMenu } from '@shared/components/DownloadMenu';
import { pageContent, replacePage, splitIntoPages } from '../utils/remediationPages';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { PageTitle } from '@shared/components/PageTitle';
import { StatusBadge } from '@shared/components/StatusBadge';

export function ReviewRemediateScreen() {
  const { t } = useTranslation();
  const { jobId = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewRemediate(jobId);
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const scroll = useSyncedScroll();
  const base = state.status === 'done' ? state.data.job.draft_remediated_md || state.data.corrected : '';
  const current = text ?? base;
  const dirty = current !== (saved ?? base);
  const pages = useMemo(() => splitIntoPages(current), [current]);
  const pageNum = pages[pageIdx]?.pageNum ?? pageIdx + 1;

  const goToPage = (idx: number) => {
    setPageIdx(idx);
    scroll.reset();
  };

  const shouldBlock = () => dirty && !approve.isPending;
  useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: shouldBlock });

  const pageIndexFor = (page: number) => Math.max(0, pages.findIndex((p) => p.pageNum === page));
  const flags = state.status === 'done' ? state.data.summary.flagged_items : [];
  const flaggedIdx = [...new Set(flags.map((flag) => pageIndexFor(flag.page)))].sort((a, b) => a - b);
  const pageFlags = flags.filter((flag) => pageIndexFor(flag.page) === pageIdx);
  const nextFlagged = flaggedIdx.find((idx) => idx > pageIdx) ?? flaggedIdx[0];

  return (
    <Stack gap="md">
      <AppBreadcrumbs crumbs={[{ label: t('review.title'), to: '/review' }, { label: state.status === 'done' ? state.data.job.source_name : t('common.loading') }]} />
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap="xs">
          <Text variant="eyebrow">{t('review.remediateEyebrow')}</Text>
          <PageTitle title={t('review.remediateTitle')} />
          <Text c="dimmed">{t('review.remediateHint')}</Text>
          {state.status === 'done' && (
            <Group gap="md">
              <Text size="sm">
                {t('review.language', { language: state.data.job.detected_language || state.data.job.language })}
              </Text>
              {state.data.job.status === 'verified' && <StatusBadge tone="done" label={t('review.verifiedSaved')} />}
            </Group>
          )}
        </Stack>
        {state.status === 'done' && (
          <Group gap="md">
            <DownloadMenu job={state.data.job} />
            <Button
              variant="outline"
              loading={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate(current, { onSuccess: () => setSaved(current) })}
            >
              {t('review.saveDraft')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve.mutate({
                  title: state.data.job.source_name.replace(/\.pdf$/i, ' (Accessible)'),
                  draft: dirty ? current : null,
                })
              }
            >
              {t('review.verifyPublish')}
            </Button>
          </Group>
        )}
      </Group>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && (
        <>
          <RunDetails models={state.data.job.models} metrics={state.data.job.metrics} />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <OriginalScan
                jobId={jobId}
                pageIndex={pageIdx}
                pageNum={pageNum}
                hasPageImages={state.data.job.source_page_count > 0}
                sync={scroll.frame(0)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text variant="label">{t('review.draft')}</Text>
                  {nextFlagged !== undefined && (
                    <Group gap="xs">
                      <Text size="sm">{t('review.pagesNeedCheck', { count: flaggedIdx.length })}</Text>
                      <Button variant="subtle" size="compact-sm" onClick={() => goToPage(nextFlagged)}>
                        {t('review.nextFlagged')}
                      </Button>
                    </Group>
                  )}
                </Group>
                <ReviewFrame label={t('review.draft')} sync={scroll.frame(1)}>
                  <Stack gap="md">
                    {pageFlags.map((flag) => (
                      <Alert key={flag.id} role="note">
                        {flag.text ? `${flag.reason}: ${flag.text}` : flag.reason}
                      </Alert>
                    ))}
                    <DraftPage
                      jobId={jobId}
                      pageIndex={pageIdx}
                      markdown={pageContent(pages, pageIdx)}
                      ariaLabel={t('review.draft')}
                      onChange={(markdown) => setText(replacePage(current, pageIdx, markdown))}
                    />
                  </Stack>
                </ReviewFrame>
              </Stack>
            </Grid.Col>
          </Grid>
          <Pagination total={pages.length} value={pageIdx + 1} onChange={(page) => goToPage(page - 1)} />
        </>
      )}
    </Stack>
  );
}
