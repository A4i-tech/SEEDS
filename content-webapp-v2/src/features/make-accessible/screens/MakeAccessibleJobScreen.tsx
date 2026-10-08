import { Breadcrumbs, Button, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { downloadRemediationArtifact } from '../api/remediation';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationJob } from '../hooks/useRemediationJob';
import type { RemediationJobDetail } from '../types/remediation.types';
import classes from './MakeAccessibleJobScreen.module.css';

const RUNNING_STATUSES = ['pending', 'running'];
const DONE_STATUSES = ['ready_to_review', 'in_review', 'verified'];

const METRIC_LABELS = [
  ['diagrams_described', 'diagrams described'],
  ['tables_fixed', 'tables fixed'],
  ['flagged_items_count', 'places need a check'],
] as const;

function metricsSummary(metrics: RemediationJobDetail['metrics']): string {
  return METRIC_LABELS.flatMap(([key, label]) => {
    const value = metrics[key];
    if (value === undefined) return [];
    return [`${value} ${label}`];
  }).join(' · ');
}

function activeStepFor(job: RemediationJobDetail | undefined): number {
  if (!job) return 0;
  if (DONE_STATUSES.includes(job.status)) return 2;
  return 1;
}

function RunningView({ job }: { job: RemediationJobDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { percent } = job.progress;

  return (
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
        {percent !== undefined && (
          <Progress
            value={percent}
            aria-label={t('makeAccessible.progressTitle')}
            classNames={{ root: classes.progressTrack, section: classes.progressFill }}
          />
        )}
        {percent !== undefined && <Text size="sm">{t('makeAccessible.percent', { percent })}</Text>}
      </Stack>
    </>
  );
}

function DoneView({ job, jobId }: { job: RemediationJobDetail; jobId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const summary = metricsSummary(job.metrics);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const base = job.source_name.replace(/\.pdf$/i, '');
      await downloadRemediationArtifact(jobId, 'docx', `${base}-accessible.docx`);
    } finally {
      setDownloading(false);
    }
  };

  return (
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
  );
}

export function MakeAccessibleJobScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { data: job, isLoading, error } = useRemediationJob(jobId);
  const loadError = toApiErrorMessage(error);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('makeAccessible.title')}</Text>
        <Text>{job?.source_name ?? jobId}</Text>
      </Breadcrumbs>

      <RemediationSteps activeStep={activeStepFor(job)} />

      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}

      {job && RUNNING_STATUSES.includes(job.status) && <RunningView job={job} />}
      {job && DONE_STATUSES.includes(job.status) && <DoneView job={job} jobId={jobId} />}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.home })}>
          {t('makeAccessible.backHome')}
        </Button>
      </Group>
    </Stack>
  );
}
