import { Alert, Breadcrumbs, Button, ColorSwatch, Grid, Group, Paper, ScrollArea, Stack, Text, Textarea, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { diffLines } from '@shared/utils/diff';
import { useReviewText } from '../hooks/useReviewText';
import classes from './ReviewTextScreen.module.css';

const DIFF_CLASS = { removed: classes.removed, added: classes.added, same: classes.same };

const DIFF_PREFIX = { removed: '− ', added: '+ ', same: '' };

function wrapSelection(textarea: HTMLTextAreaElement | null, before: string, after: string, linePrefix: string) {
  if (!textarea) return '';
  const { value, selectionStart, selectionEnd } = textarea;
  if (linePrefix) {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const next = `${value.slice(0, lineStart)}${linePrefix}${value.slice(lineStart)}`;
    queueMicrotask(() => textarea.setSelectionRange(selectionStart + linePrefix.length, selectionEnd + linePrefix.length));
    return next;
  }
  const next = `${value.slice(0, selectionStart)}${before}${value.slice(selectionStart, selectionEnd)}${after}${value.slice(selectionEnd)}`;
  queueMicrotask(() =>
    textarea.setSelectionRange(selectionStart + before.length, selectionEnd + before.length),
  );
  return next;
}

export function ReviewTextScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewText(jobId);
  const [edited, setEdited] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyTool = (before: string, after: string, linePrefix: string) => {
    setEdited(wrapSelection(textareaRef.current, before, after, linePrefix));
  };

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{jobId}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('review.textTitle')}</Title>
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
                <Text fw={700}>{t('review.source')}</Text>
                <Paper p="md" radius="md" ff="monospace">
                <ScrollArea.Autosize mah="60vh" role="document" aria-label={t('review.source')} aria-readonly="true">
                  {diffLines(state.data.raw, edited || state.data.corrected).map((op, index) => (
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
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                <Text fw={700}>{t('review.edit')}</Text>
                <Group gap="xs" role="toolbar" aria-label={t('review.edit')}>
                  <Button variant="subtle" size="xs" fw={700} onClick={() => applyTool('**', '**', '')} aria-label="Bold">
                    B
                  </Button>
                  <Button
                    variant="subtle"
                    size="xs"
                    fs="italic"
                    onClick={() => applyTool('*', '*', '')}
                    aria-label="Italic"
                  >
                    I
                  </Button>
                  <Button
                    variant="subtle"
                    size="xs"
                    td="underline"
                    onClick={() => applyTool('<u>', '</u>', '')}
                    aria-label="Underline"
                  >
                    U
                  </Button>
                  <Button variant="subtle" size="xs" onClick={() => applyTool('', '', '# ')} aria-label="Heading">
                    H1
                  </Button>
                </Group>
                <Textarea
                  ref={textareaRef}
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
              {t('review.editAction')}
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate(undefined)}>
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
