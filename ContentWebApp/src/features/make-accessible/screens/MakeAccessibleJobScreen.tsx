import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toApiState } from '@shared/utils/apiState';
import { RemediationSteps } from '../components/RemediationSteps';
import { useRemediationJob } from '../hooks/useRemediationJob';
import { DownloadMenu } from '@shared/components/DownloadMenu';
import { StageProgress } from '@features/jobs/components/StageProgress';
import { REMEDIATION_UI } from '@features/jobs/types/job.types';
import type { RemediationJobDetail } from '../types/remediation.types';
import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs';
import { PageTitle } from '@shared/components/PageTitle';

const METRIC_LABELS = [
  ['diagrams_described', 'diagrams described'],
  ['tables_fixed', 'tables fixed'],
  ['flagged_items_count', 'places need a check'],
] as const;

function metricsSummary(metrics: RemediationJobDetail['metrics']): string {
  return METRIC_LABELS.map(([key, label]) => `${metrics[key]} ${label}`).join(' · ');
}

function RunningView({ job }: { job: RemediationJobDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <PageTitle title={t('makeAccessible.making', { name: job.source_name })} />
      <Paper p="lg" radius="md">
        <Stack gap="xs" align="flex-start">
          <Text variant="label">{t('makeAccessible.leaveTitle')}</Text>
          <Text size="sm">{t('makeAccessible.leaveBody')}</Text>
          <Button variant="outline" onClick={() => void navigate({ to: '/jobs' })}>
            {t('makeAccessible.goToJobs')}
          </Button>
        </Stack>
      </Paper>
      <Stack gap="xs">
        <Text variant="label">{t('makeAccessible.progressTitle')}</Text>
        <StageProgress job={job} />
      </Stack>
    </>
  );
}

function DoneView({ job, jobId }: { job: RemediationJobDetail; jobId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const summary = metricsSummary(job.metrics);

  return (
    <>
      <PageTitle title={t('makeAccessible.ready')} />
      <Text c="dimmed">{t('makeAccessible.readyBody')}</Text>
      {summary && <Text size="sm">{summary}</Text>}
      <Group gap="md">
        <DownloadMenu job={job} />
        <Button onClick={() => void navigate({ to: '/review/remediate/$jobId', params: { jobId } })}>
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
      <AppBreadcrumbs crumbs={[{ label: t('makeAccessible.title'), to: '/make-accessible' }, { label: jobState.status === 'done' ? jobState.data.source_name : jobId }]} />

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
