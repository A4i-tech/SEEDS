import { Breadcrumbs, Button, Grid, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { diffLines } from '@shared/utils/diff';
import { useReviewText } from '../hooks/useReviewText';
import classes from './ReviewTextScreen.module.css';

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
  const { jobId = '' } = useParams();
  const { raw, corrected, isLoading, save, approve } = useReviewText(jobId);
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const text = edited ?? corrected;
  const ops = diffLines(raw, text);

  const applyTool = (before: string, after: string, linePrefix: string) => {
    setEdited(wrapSelection(textareaRef.current, before, after, linePrefix));
  };

  const handleSave = async () => {
    setError(null);
    try {
      await save.mutateAsync(text);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{jobId}</Text>
      </Breadcrumbs>
      <Title order={2}>{t('review.textTitle')}</Title>
      <Text c="dimmed">{t('review.textHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}

      <Group gap="lg" aria-label={t('review.legend')}>
        <Group gap="xs">
          <span className={`${classes.swatch} ${classes.removedSwatch}`} aria-hidden />
          <Text size="sm">{t('review.removed')}</Text>
        </Group>
        <Group gap="xs">
          <span className={`${classes.swatch} ${classes.addedSwatch}`} aria-hidden />
          <Text size="sm">{t('review.added')}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {t('review.greyNote')}
        </Text>
      </Group>

      <Grid>
        <Grid.Col span={6}>
          <Stack gap="xs">
            <Text fw={700}>{t('review.source')}</Text>
            <div className={classes.sourcePane} role="document" aria-label={t('review.source')} aria-readonly="true">
              {ops.map((op, index) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  className={
                    op.type === 'removed'
                      ? classes.removed
                      : op.type === 'added'
                        ? classes.added
                        : classes.same
                  }
                >
                  <span className={classes.lineNo} aria-hidden>
                    {index + 1}
                  </span>
                  <span>
                    {op.type === 'removed' ? '− ' : op.type === 'added' ? '+ ' : ''}
                    {op.text || ' '}
                  </span>
                </div>
              ))}
            </div>
          </Stack>
        </Grid.Col>
        <Grid.Col span={6}>
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
              value={text}
              onChange={(e) => setEdited(e.currentTarget.value)}
              autosize
              minRows={20}
              aria-label={t('review.edit')}
              className={classes.editPane}
            />
          </Stack>
        </Grid.Col>
      </Grid>

      <Group gap="md">
        <Button
          variant="outline"
          className={classes.secondaryButton}
          loading={save.isPending}
          onClick={() => void handleSave()}
        >
          {t('review.editAction')}
        </Button>
        <Button
          className={classes.submitButton}
          loading={approve.isPending}
          onClick={() => void approve.mutateAsync(undefined)}
        >
          {t('review.approve')}
        </Button>
        <Button variant="subtle" onClick={() => void navigate(routePaths.review)}>
          {t('review.backQueue')}
        </Button>
      </Group>
    </Stack>
  );
}
