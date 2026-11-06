import { Alert, Button, ColorSwatch, Grid, Group, Pagination, Paper, ScrollArea, Stack, Text, Textarea } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { diffLines } from '@shared/utils/diff';
import { useReviewText } from '../hooks/useReviewText';
import { pageContent, splitIntoPages, toPlainText } from '../utils/remediationPages';
import classes from './ReviewTextScreen.module.css';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { PageTitle } from '@shared/components/PageTitle';

const DIFF_CLASS = { removed: classes.removed, added: classes.added, same: classes.same };

const DIFF_PREFIX = { removed: '− ', added: '+ ', same: '' };

export function ReviewTextScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewText(jobId);
  const [edited, setEdited] = useState('');
  const [page, setPage] = useState(1);
  const raw = state.status === 'done' ? state.data.raw : '';
  const current = edited || (state.status === 'done' ? state.data.corrected : '');
  const rawPages = useMemo(() => splitIntoPages(raw), [raw]);
  const editedPages = useMemo(() => splitIntoPages(current), [current]);

  return (
    <Stack gap="md">
      <AppBreadcrumbs crumbs={[{ label: t('review.title'), to: '/review' }, { label: state.status === 'done' ? state.data.job.source_name : t('common.loading') }]} />
      <PageTitle title={t('review.textTitle')} />
      <Text c="dimmed">{t('review.textHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && (
        <>
          <Group gap="lg" aria-label={t('review.legend')}>
            <Group gap="xs">
              <ColorSwatch size={16} radius="sm" color="var(--seeds-badge-hard-bg)" withShadow={false} className={classes.removedSwatch} aria-hidden />
              <Text size="sm">{t('review.removed')}</Text>
            </Group>
            <Group gap="xs">
              <ColorSwatch size={16} radius="sm" color="var(--seeds-badge-easy-bg)" withShadow={false} className={classes.addedSwatch} aria-hidden />
              <Text size="sm">{t('review.added')}</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {t('review.greyNote')}
            </Text>
          </Group>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                <Text variant="label">{t('review.source')}</Text>
                <Paper p="md" radius="md" ff="monospace">
                <ScrollArea.Autosize mah="60vh" role="document" aria-label={t('review.source')} aria-readonly="true">
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{toPlainText(pageContent(rawPages, page - 1))}</Text>
                </ScrollArea.Autosize>
                </Paper>
                <Pagination total={Math.max(rawPages.length, editedPages.length)} value={page} onChange={setPage} />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                <Text variant="label">{t('review.edit')}</Text>
                <Paper p="md" radius="md" ff="monospace">
                  <ScrollArea.Autosize mah="30vh" role="document" aria-label={t('review.diff')} aria-readonly="true">
                    {diffLines(toPlainText(pageContent(rawPages, page - 1)), toPlainText(pageContent(editedPages, page - 1))).map((op, index) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        className={DIFF_CLASS[op.type]}
                      >
                        <span className={classes.lineNo} aria-hidden>
                          {index + 1}
                        </span>
                        <span>
                          {DIFF_PREFIX[op.type]}
                          {op.text || ' '}
                        </span>
                      </div>
                    ))}
                  </ScrollArea.Autosize>
                </Paper>
                <Textarea
                  value={edited || state.data.corrected}
                  onChange={(e) => setEdited(e.currentTarget.value)}
                  autosize
                  minRows={20}
                  aria-label={t('review.edit')}
                  styles={{ input: { fontFamily: 'monospace' } }}
                />
              </Stack>
            </Grid.Col>
          </Grid>

          <Group gap="md">
            <Button variant="outline" loading={save.isPending} onClick={() => save.mutate(edited || state.data.corrected)}>
              {t('review.saveDraft')}
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              {t('review.approve')}
            </Button>
            <Button variant="subtle" onClick={() => void navigate({ to: '/review' })}>
              {t('review.backQueue')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
