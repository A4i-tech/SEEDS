import { Alert, Box, Button, Grid, Group, Image, Pagination, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getRemediationImage, reviewKeys } from '../api/review';
import { toApiState } from '@shared/utils/apiState';
import { useReviewRemediate } from '../hooks/useReviewRemediate';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { OriginalScan } from '../components/OriginalScan';
import { ArtifactDownloads } from '@features/jobs/components/ArtifactDownloads';
import { RunDetails } from '../components/RunDetails';
import { pageContent, replacePage, splitIntoPages } from '../utils/remediationPages';
import { readFigure, writeFigure } from '../utils/remediationFigures';
import classes from './ReviewRemediateScreen.module.css';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { PageTitle } from '@shared/components/PageTitle';

function FigureImage({ jobId, imageName, alt }: { jobId: string; imageName: string; alt: string }) {
  const image = useQuery({
    queryKey: reviewKeys.image(jobId, imageName),
    queryFn: () => getRemediationImage(jobId, imageName),
  });
  useEffect(
    () => () => {
      if (image.data) URL.revokeObjectURL(image.data);
    },
    [image.data],
  );
  const imageState = toApiState(image);
  if (imageState.status === 'error') return <Text c="red" role="alert">{imageState.error.message}</Text>;
  if (imageState.status !== 'done') return <></>;
  return <Image src={imageState.data} alt={alt} radius="sm" />;
}

function FigureFields({
  figure,
  onCommit,
}: {
  figure: { alt: string; description: string };
  onCommit: (figure: { alt: string; description: string }) => void;
}) {
  const { t } = useTranslation();
  const commit = (next: Partial<typeof figure>) => {
    const merged = { ...figure, ...next };
    if (merged.alt !== figure.alt || merged.description !== figure.description) onCommit(merged);
  };
  return (
    <Stack gap="xs">
      <TextInput label={t('review.figureAlt')} defaultValue={figure.alt} onBlur={(e) => commit({ alt: e.currentTarget.value })} />
      <Textarea
        label={t('review.figureDescription')}
        autosize
        minRows={2}
        defaultValue={figure.description}
        onBlur={(e) => commit({ description: e.currentTarget.value })}
      />
    </Stack>
  );
}

export function ReviewRemediateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewRemediate(jobId);
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const base = state.status === 'done' ? state.data.job.draft_remediated_md || state.data.corrected : '';
  const current = text ?? base;
  const dirty = current !== (saved ?? base);
  const pages = useMemo(() => splitIntoPages(current), [current]);
  const pageNum = pages[pageIdx]?.pageNum ?? pageIdx + 1;

  const shouldBlock = () => dirty && !approve.isPending;
  useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: shouldBlock });

  const pageIndexFor = (page: number) => Math.max(0, pages.findIndex((p) => p.pageNum === page));
  const flags = state.status === 'done' ? state.data.summary.flagged_items : [];
  const flaggedIdx = [...new Set(flags.map((flag) => pageIndexFor(flag.page)))].sort((a, b) => a - b);
  const pageFlags = flags.filter((flag) => pageIndexFor(flag.page) === pageIdx);
  const pageDiagrams = state.status === 'done' ? state.data.summary.diagrams.filter((diagram) => diagram.page === pageNum) : [];
  const nextFlagged = flaggedIdx.find((idx) => idx > pageIdx) ?? flaggedIdx[0];

  return (
    <Stack gap="md">
      <AppBreadcrumbs crumbs={[{ label: t('review.title'), to: '/review' }, { label: state.status === 'done' ? state.data.job.source_name : t('common.loading') }]} />
      <Text variant="eyebrow">{t('review.remediateEyebrow')}</Text>
      <PageTitle title={t('review.remediateTitle')} />
      <Text c="dimmed">{t('review.remediateHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && (
        <>
          <ArtifactDownloads job={state.data.job} />
          <RunDetails models={state.data.job.models} metrics={state.data.job.metrics} />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <OriginalScan
                jobId={jobId}
                pageIndex={pageIdx}
                pageNum={pageNum}
                hasPageImages={state.data.job.source_page_count > 0}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text variant="label">{t('review.draft')}</Text>
                  {nextFlagged !== undefined && (
                    <Button variant="subtle" size="compact-sm" onClick={() => setPageIdx(nextFlagged)}>
                      {t('review.nextFlagged')}
                    </Button>
                  )}
                </Group>
                {pageFlags.map((flag) => (
                  <Alert key={flag.id} role="note">
                    {flag.reason}
                  </Alert>
                ))}
                <MarkdownEditor
                  key={`${pageIdx}:${editorVersion}`}
                  value={pageContent(pages, pageIdx)}
                  onChange={(markdown) => setText(replacePage(current, pageIdx, markdown))}
                  ariaLabel={t('review.draft')}
                />
              </Stack>
            </Grid.Col>
          </Grid>
          <Pagination total={pages.length} value={pageIdx + 1} onChange={(page) => setPageIdx(page - 1)} />

          <Group gap="md">
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
            <Button variant="subtle" onClick={() => void navigate({ to: '/review' })}>
              {t('review.backQueue')}
            </Button>
          </Group>

          {pageDiagrams.length > 0 && (
          <Paper p="lg" radius="md">
          <Stack gap="xs">
            <Text variant="label">{t('review.diagrams')}</Text>
            {pageDiagrams.map((diagram) => {
              const figure = readFigure(current, diagram.image_name);
              return (
                <Group key={diagram.id} gap="md" align="flex-start" wrap="nowrap" className={classes.finding}>
                  <Box w={200} style={{ flexShrink: 0 }}>
                    <FigureImage jobId={jobId} imageName={diagram.image_name} alt={figure?.alt ?? diagram.alt_text} />
                  </Box>
                  {figure ? (
                    <FigureFields
                      key={`${figure.alt}\n${figure.description}`}
                      figure={figure}
                      onCommit={(next) => {
                        setText(writeFigure(current, diagram.image_name, next));
                        setEditorVersion((version) => version + 1);
                      }}
                    />
                  ) : (
                    <Text size="sm" c="dimmed">
                      {diagram.alt_text}
                    </Text>
                  )}
                </Group>
              );
            })}
          </Stack>
          </Paper>
          )}


          <Paper p="lg" radius="md">
          <Stack gap="xs">
            <Text variant="label">{t('review.findings')}</Text>
            <Text size="sm" c="dimmed">
              {t('review.findingsMeta', {
                flagged: state.data.summary.flagged_items_count,
                diagrams: state.data.summary.diagrams_described_count,
                tables: state.data.summary.tables_fixed_count,
                pages: state.data.summary.total_pages,
              })}
            </Text>
            {flags.length === 0 && <Text size="sm">{t('review.noFindings')}</Text>}
            {flags.map((flag) => (
              <Stack key={flag.id} gap={0} className={classes.finding}>
                <Text size="sm" variant="rowTitle">
                  {t('review.pageN', { n: flag.page })} · {flag.type}
                </Text>
                <Text size="sm">{flag.reason}</Text>
                {flag.text && (
                  <Text size="sm" c="dimmed">
                    {flag.text}
                  </Text>
                )}
              </Stack>
            ))}
          </Stack>
          </Paper>

        </>
      )}
    </Stack>
  );
}
