import { Alert, Breadcrumbs, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@shared/components/StatusBadge';
import { LoadError } from '@shared/components/LoadError';
import { formatRelativeTime } from '@shared/utils/format';
import { toApiState } from '@shared/utils/apiState';
import type { JobRow, JobStatus, SyncJob } from '../types/job.types';
import { syncTitle } from '../types/job.types';
import { SyncJobItemsTable } from '../components/SyncJobItemsTable';
import { useJobs } from '../hooks/useJobs';
import { terminalStatuses, useSyncJob } from '../hooks/useSyncJob';

function toneFor(status: SyncJob['status']): JobStatus {
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  return 'running';
}

interface JobDetailView {
  title: string;
  type: string;
  tone: JobStatus;
  updated: string;
}

function jobDetailView(row: JobRow): JobDetailView {
  return { title: row.title, type: row.type, tone: row.status, updated: row.updated };
}

function syncJobDetailView(job: SyncJob): JobDetailView {
  return {
    title: syncTitle(job),
    type: 'course-sync',
    tone: toneFor(job.status),
    updated: job.finished_at || job.started_at,
  };
}

function percentOf(job: SyncJob): number {
  return Math.round((job.processed / job.total_courses) * 100);
}

export function JobDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const rowsState = useJobs();
  const row = rowsState.status === 'done' && rowsState.data.find((r) => r.id === jobId);
  const isRemediation = row && row.type === 'make-accessible';
  const jobState = toApiState(useSyncJob(jobId, !isRemediation));
  const job = jobState.status === 'done' && jobState.data;

  const finished = job && terminalStatuses.has(job.status);
  const view = (job && syncJobDetailView(job)) || (row && jobDetailView(row));

  return (
    <Stack gap="md">
      {view && (
        <>
          <Breadcrumbs aria-label="Breadcrumb">
            <Text>{t('jobs.title')}</Text>
            <Text>{view.title}</Text>
          </Breadcrumbs>

          <Title order={2}>{view.title}</Title>
          <Group gap="sm">
            <Text c="dimmed">{t(`jobs.types.${view.type}`)}</Text>
            <StatusBadge tone={view.tone} label={t(`jobs.statuses.${view.tone}`)} />
            {view.updated && <Text c="dimmed">{formatRelativeTime(view.updated)}</Text>}
          </Group>
        </>
      )}

      {jobState.status === 'loading' && <Text c="dimmed">{t('common.loading')}</Text>}
      {jobState.status === 'error' && <LoadError error={jobState.error} />}

      {row && row.type === 'make-accessible' && (
        <Paper p="lg" radius="md">
          <Stack gap="xs" align="flex-start">
            <Text>{t('jobs.detail.remediationNote')}</Text>
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/make-accessible/$jobId', params: { jobId: row.id } })}
            >
              {t('jobs.detail.openRemediation')}
            </Button>
          </Stack>
        </Paper>
      )}

      {job && !finished && (
        <Stack gap="xs">
          <Text fw={700}>{t('jobs.detail.progressTitle')}</Text>
          {job.total_courses > 0 && (
            <>
              <Text>{t('jobs.detail.processedOf', { processed: job.processed, total: job.total_courses })}</Text>
              <Progress value={percentOf(job)} aria-label={t('jobs.detail.progressTitle')} />
              <Text size="sm">{t('jobs.detail.percent', { percent: percentOf(job) })}</Text>
            </>
          )}
        </Stack>
      )}
      {job && job.status === 'completed' && (
        <Text>
          {t('jobs.detail.summary', {
            saved: job.stats.saved,
            skipped: job.stats.skipped,
            empty: job.stats.empty,
            failed: job.stats.failed,
          })}
        </Text>
      )}
      {job && job.status === 'failed' && job.error && <Alert>{job.error}</Alert>}

      {finished && <SyncJobItemsTable jobId={jobId} />}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: '/jobs' })}>
          {t('jobs.detail.back')}
        </Button>
      </Group>
    </Stack>
  );
}
