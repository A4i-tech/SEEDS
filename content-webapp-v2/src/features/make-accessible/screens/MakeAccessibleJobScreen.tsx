import { Breadcrumbs, Button, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { downloadRemediationArtifact } from '../api/remediation';
import { useRemediationJob } from '../hooks/useRemediationJob';
import classes from './MakeAccessibleJobScreen.module.css';

const steps = ['upload', 'remediating', 'review'] as const;

function metricsSummary(metrics: {
  diagrams_described: number | null;
  tables_fixed: number | null;
  flagged_items_count: number | null;
}): string {
  const parts: string[] = [];
  if (metrics.diagrams_described !== null) parts.push(`${metrics.diagrams_described} diagrams described`);
  if (metrics.tables_fixed !== null) parts.push(`${metrics.tables_fixed} tables fixed`);
  if (metrics.flagged_items_count !== null) parts.push(`${metrics.flagged_items_count} places need a check`);
  return parts.join(' · ');
}

export function MakeAccessibleJobScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { data: job, isLoading, error } = useRemediationJob(jobId);
  const [downloading, setDownloading] = useState(false);

  const running = !!job && (job.status === 'pending' || job.status === 'running');
  const done = !!job && ['ready_to_review', 'in_review', 'verified'].includes(job.status);
  const percent = job?.progress?.percent ?? null;
  const activeStep = !job ? 0 : done ? 2 : 1;
  const summary = job && done ? metricsSummary(job.metrics) : '';

  const handleDownload = async () => {
    if (!job) return;
    setDownloading(true);
    try {
      const base = job.source_name.replace(/\.pdf$/i, '');
      await downloadRemediationArtifact(jobId, 'docx', `${base}-accessible.docx`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('makeAccessible.title')}</Text>
        <Text>{job?.source_name ?? jobId}</Text>
      </Breadcrumbs>

      <Group gap="sm" aria-label={t('makeAccessible.steps')}>
        {steps.map((step, index) => (
          <Text key={step} fw={index === activeStep ? 700 : 400} aria-current={index === activeStep ? 'step' : undefined}>
            {t(`makeAccessible.steps.${step}`)}
            {index < steps.length - 1 && ' › '}
          </Text>
        ))}
      </Group>

      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {toApiErrorMessage(error) && (
        <Text c="red" role="alert">
          {toApiErrorMessage(error)}
        </Text>
      )}

      {running && job && (
        <>
          <Title order={2}>{t('makeAccessible.making', { name: job.source_name })}</Title>
          <Stack gap="xs" className={classes.notice}>
            <Text fw={700}>{t('makeAccessible.leaveTitle')}</Text>
            <Text size="sm">{t('makeAccessible.leaveBody')}</Text>
            <Button
              variant="outline"
              className={classes.secondaryButton}
              onClick={() => void navigate({ to: routePaths.jobs })}
            >
              {t('makeAccessible.goToJobs')}
            </Button>
          </Stack>
          <Stack gap="xs">
            <Text fw={700}>{t('makeAccessible.progressTitle')}</Text>
            {job.progress.message && <Text>{job.progress.message}</Text>}
            {percent !== null && (
              <Progress
                value={percent}
                aria-label={t('makeAccessible.progressTitle')}
                classNames={{ root: classes.progressTrack, section: classes.progressFill }}
              />
            )}
            {percent !== null && <Text size="sm">{t('makeAccessible.percent', { percent })}</Text>}
          </Stack>
        </>
      )}

      {done && job && (
        <>
          <Title order={2}>{t('makeAccessible.ready')}</Title>
          <Text c="dimmed">{t('makeAccessible.readyBody')}</Text>
          {summary && <Text size="sm">{summary}</Text>}
          <Group gap="md">
            <Button
              variant="outline"
              className={classes.secondaryButton}
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {t('makeAccessible.download')}
            </Button>
            <Button className={classes.submitButton} onClick={() => void navigate({ to: routePaths.review })}>
              {t('makeAccessible.startReview')}
            </Button>
          </Group>
        </>
      )}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.home })}>
          {t('makeAccessible.backHome')}
        </Button>
      </Group>
    </Stack>
  );
}
