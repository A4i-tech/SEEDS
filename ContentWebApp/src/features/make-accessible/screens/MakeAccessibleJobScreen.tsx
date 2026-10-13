import { Alert, Breadcrumbs, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toApiState } from '@shared/utils/apiState';
import { notifyApiError } from '@shared/utils/notifyApiError';
import { downloadRemediationArtifact } from '../api/remediation';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationJob } from '../hooks/useRemediationJob';
import { REMEDIATION_UI } from '@features/jobs/types/job.types';
import type { RemediationJobDetail } from '../types/remediation.types';

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

function RunningView({ job }: { job: RemediationJobDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { percent } = job.progress;

  return (
    <>
      <Title order={2}>{t('makeAccessible.making', { name: job.source_name })}</Title>
      <Paper p="lg" radius="md">
        <Stack gap="xs" align="flex-start">
          <Text fw={700}>{t('makeAccessible.leaveTitle')}</Text>
          <Text size="sm">{t('makeAccessible.leaveBody')}</Text>
          <Button variant="outline" onClick={() => void navigate({ to: '/jobs' })}>
            {t('makeAccessible.goToJobs')}
          </Button>
        </Stack>
      </Paper>
      <Stack gap="xs">
        <Text fw={700}>{t('makeAccessible.progressTitle')}</Text>
        {job.progress.message && <Text>{job.progress.message}</Text>}
        {percent !== undefined && <Progress value={percent} aria-label={t('makeAccessible.progressTitle')} />}
        {percent !== undefined && <Text size="sm">{t('makeAccessible.percent', { percent })}</Text>}
      </Stack>
    </>
  );
}

function DoneView({ job, jobId }: { job: RemediationJobDetail; jobId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const summary = metricsSummary(job.metrics);

  const download = useMutation({
    mutationFn: () =>
      downloadRemediationArtifact(jobId, 'docx', `${job.source_name.replace(/\.pdf$/i, '')}-accessible.docx`),
    onError: notifyApiError,
  });

  return (
    <>
      <Title order={2}>{t('makeAccessible.ready')}</Title>
      <Text c="dimmed">{t('makeAccessible.readyBody')}</Text>
      {summary && <Text size="sm">{summary}</Text>}
      <Group gap="md">
        <Button variant="outline" loading={download.isPending} onClick={() => download.mutate()}>
          {t('makeAccessible.download')}
        </Button>
        <Button onClick={() => void navigate({ to: '/review' })}>
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
  const jobState = toApiState(useRemediationJob(jobId));

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('makeAccessible.title')}</Text>
        <Text>{jobState.status === 'done' ? jobState.data.source_name : jobId}</Text>
      </Breadcrumbs>

      {jobState.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {jobState.status === 'error' && <Alert>{jobState.error.message}</Alert>}
      {jobState.status === 'done' && (
        <>
          <RemediationSteps activeStep={REMEDIATION_UI[jobState.data.status].step} />
          {jobState.data.status === 'failed' && (jobState.data.error || jobState.data.translation_error) && (
            <Alert>{jobState.data.error || jobState.data.translation_error}</Alert>
          )}
          {REMEDIATION_UI[jobState.data.status].view === 'running' && <RunningView job={jobState.data} />}
          {REMEDIATION_UI[jobState.data.status].view === 'done' && (
            <DoneView job={jobState.data} jobId={jobId} />
          )}
        </>
      )}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: '/home' })}>
          {t('makeAccessible.backHome')}
        </Button>
      </Group>
    </Stack>
  );
}
