import { Alert, Breadcrumbs, Button, Group, Image, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { routePaths } from '@app/navigation/routePaths';
import { getRemediationImage, reviewKeys } from '../api/review';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
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
  if (image.error) return <Text c="red" role="alert">{toApiErrorMessage(image.error)}</Text>;
  if (!image.data) return <></>;
  return <Image src={image.data} alt={alt} radius="sm" />;
}

export function ReviewRemediateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { job, summary, draftSeed, isLoading, loadError, save, approve } = useReviewRemediate(jobId);
  const [edited, setEdited] = useState<string | undefined>(undefined);

  const draft = edited === undefined ? draftSeed : edited;
  const title = job?.source_name ?? jobId;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text variant="eyebrow">{t('review.remediateEyebrow')}</Text>
      <Title order={2}>{t('review.remediateTitle')}</Title>
      <Text c="dimmed">{t('review.remediateHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && <Alert>{loadError}</Alert>}

      {summary && (
        <Paper p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={700}>{t('review.diagrams')}</Text>
          {summary.diagrams.map((diagram) => (
            <Stack key={diagram.id} gap={0} className={classes.finding}>
              <FigureImage jobId={jobId} imageName={diagram.image_name} alt={diagram.alt_text} />
              <Text size="sm" c="dimmed">
                {diagram.alt_text}
              </Text>
            </Stack>
          ))}
        </Stack>
        </Paper>
      )}

      {summary && (
        <Paper p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={700}>{t('review.findings')}</Text>
          <Text size="sm" c="dimmed">
            {t('review.findingsMeta', {
              flagged: summary.flagged_items_count,
              diagrams: summary.diagrams_described_count,
              tables: summary.tables_fixed_count,
              pages: summary.total_pages,
            })}
          </Text>
          {summary.flagged_items.length === 0 && <Text size="sm">{t('review.noFindings')}</Text>}
          {summary.flagged_items.map((flag) => (
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
      )}

      {!isLoading && (
        <Stack gap="xs">
          <Text fw={700}>{t('review.draft')}</Text>
          <Textarea
            value={draft}
            onChange={(e) => setEdited(e.currentTarget.value)}
            autosize
            minRows={16}
            aria-label={t('review.draft')}
            styles={{ input: { fontFamily: 'monospace' } }}
          />
        </Stack>
      )}

      <Group gap="md">
        <Button variant="outline" loading={save.isPending} onClick={() => save.mutate(draft)}>
          {t('review.editAction')}
        </Button>
        <Button
          loading={approve.isPending}
          onClick={() => approve.mutate(job && job.source_name.replace(/\.pdf$/i, ' (Accessible)'))}
        >
          {t('review.approve')}
        </Button>
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.review })}>
          {t('review.backQueue')}
        </Button>
      </Group>
    </Stack>
  );
}
