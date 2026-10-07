import { Breadcrumbs, Button, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { getRemediationImage } from '../api/review';
import { useReviewRemediate } from '../hooks/useReviewRemediate';
import classes from './ReviewRemediateScreen.module.css';

function FigureImage({ jobId, imageName, alt }: { jobId: string; imageName: string; alt: string }) {
  const image = useQuery({
    queryKey: ['review', jobId, 'image', imageName],
    queryFn: () => getRemediationImage(jobId, imageName),
  });
  useEffect(
    () => () => {
      if (image.data) URL.revokeObjectURL(image.data);
    },
    [image.data],
  );
  if (!image.data) return null;
  return <img src={image.data} alt={alt} className={classes.figure} />;
}

export function ReviewRemediateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams();
  const { job, summary, draftSeed, isLoading, loadError, save, approve } = useReviewRemediate(jobId);
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draft = edited ?? draftSeed;
  const findings = summary?.flagged_items ?? [];
  const title = job?.source_name ?? jobId;

  const handleSave = async () => {
    setError(null);
    try {
      await save.mutateAsync(draft);
    } catch (err) {
      setError(toApiErrorMessage(err));
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('review.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>
      <Text className={classes.eyebrow}>{t('review.remediateEyebrow')}</Text>
      <Title order={2}>{t('review.remediateTitle')}</Title>
      <Text c="dimmed">{t('review.remediateHint')}</Text>
      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}

      {summary && (
        <Stack gap="xs" className={classes.panel}>
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
      )}

      {summary && (
        <Stack gap="xs" className={classes.panel}>
          <Text fw={700}>{t('review.findings')}</Text>
          <Text size="sm" c="dimmed">
            {t('review.findingsMeta', {
              flagged: summary.flagged_items_count,
              diagrams: summary.diagrams_described_count,
              tables: summary.tables_fixed_count,
              pages: summary.total_pages,
            })}
          </Text>
          {findings.length === 0 && <Text size="sm">{t('review.noFindings')}</Text>}
          {findings.map((flag) => (
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
            className={classes.editPane}
          />
        </Stack>
      )}

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
          onClick={() => void approve.mutateAsync(job ? job.source_name.replace(/\.pdf$/i, ' (Accessible)') : undefined)}
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
