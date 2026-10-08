import { Alert, Breadcrumbs, Button, Group, Image, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getRemediationImage, reviewKeys } from '../api/review';
import { toApiState } from '@shared/utils/apiState';
import { useReviewRemediate } from '../hooks/useReviewRemediate';
import classes from './ReviewRemediateScreen.module.css';

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

export function ReviewRemediateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { state, save, approve } = useReviewRemediate(jobId);
  const [edited, setEdited] = useState('');

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{state.status === 'done' ? state.data.job.source_name : jobId}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.remediateEyebrow')}</Text>
      <Title order={2}>{t('review.remediateTitle')}</Title>
      <Text c="dimmed">{t('review.remediateHint')}</Text>
      {state.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {state.status === 'error' && <Alert>{state.error.message}</Alert>}
      {state.status === 'done' && (
        <>
          <Paper p="lg" radius="md">
          <Stack gap="xs">
            <Text fw={700}>{t('review.diagrams')}</Text>
            {state.data.summary.diagrams.map((diagram) => (
              <Stack key={diagram.id} gap={0} className={classes.finding}>
                <FigureImage jobId={jobId} imageName={diagram.image_name} alt={diagram.alt_text} />
                <Text size="sm" c="dimmed">
                  {diagram.alt_text}
                </Text>
              </Stack>
            ))}
          </Stack>
          </Paper>

          <Paper p="lg" radius="md">
          <Stack gap="xs">
            <Text fw={700}>{t('review.findings')}</Text>
            <Text size="sm" c="dimmed">
              {t('review.findingsMeta', {
                flagged: state.data.summary.flagged_items_count,
                diagrams: state.data.summary.diagrams_described_count,
                tables: state.data.summary.tables_fixed_count,
                pages: state.data.summary.total_pages,
              })}
            </Text>
            {state.data.summary.flagged_items.length === 0 && <Text size="sm">{t('review.noFindings')}</Text>}
            {state.data.summary.flagged_items.map((flag) => (
              <Stack key={flag.id} gap={0} className={classes.finding}>
                <Text size="sm" fw={700}>
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

          <Stack gap="xs">
            <Text fw={700}>{t('review.draft')}</Text>
            <Textarea
              value={edited || state.data.job.draft_remediated_md || state.data.corrected || ''}
              onChange={(e) => setEdited(e.currentTarget.value)}
              autosize
              minRows={16}
              aria-label={t('review.draft')}
              styles={{ input: { fontFamily: 'monospace' } }}
            />
          </Stack>

          <Group gap="md">
            <Button
              variant="outline"
              loading={save.isPending}
              onClick={() => save.mutate(edited || state.data.job.draft_remediated_md || state.data.corrected || '')}
            >
              {t('review.editAction')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() => approve.mutate(state.data.job.source_name.replace(/\.pdf$/i, ' (Accessible)'))}
            >
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
