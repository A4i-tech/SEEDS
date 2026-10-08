import { Alert, Breadcrumbs, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { StatusBadge } from '@shared/components/StatusBadge';
import { LoadError } from '@shared/components/LoadError';
import { formatRelativeTime } from '@shared/utils/format';
import type { JobRow, JobStatus, SyncJob } from '../types/job.types';
import { syncTitle } from '../types/job.types';
import { SyncJobItemsTable } from '../components/SyncJobItemsTable';
import { useJobs } from '../hooks/useJobs';
import { terminalStatuses, useSyncJob } from '../hooks/useSyncJob';

function toneFor(status: SyncJob['status'] | undefined): JobStatus {
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  return 'running';
}

function jobDetailView(t: TFunction, row: JobRow | undefined, job: SyncJob | undefined) {
  return {
    title: row?.title ?? (job === undefined ? t('jobs.detail.allCourses') : syncTitle(job)),
    type: row?.type ?? 'course-sync',
    tone: row?.status ?? toneFor(job?.status),
    updated: job === undefined ? row?.updated : job.finished_at || job.started_at,
  };
}

export function JobDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { rows } = useJobs();
  const row = rows.find((r) => r.id === jobId);
  const isRemediation = row?.type === 'make-accessible';
  const { data: job, isLoading, error } = useSyncJob(jobId, !isRemediation);

  const finished = job !== undefined && terminalStatuses.has(job.status);
  const percent = job ? Math.round((job.processed / job.total_courses) * 100) : 0;
  const view = jobDetailView(t, row, job);

  return (
    <Stack gap="md">
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

      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      <LoadError error={error} />

      {isRemediation && (
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
              <Progress value={percent} aria-label={t('jobs.detail.progressTitle')} />
              <Text size="sm">{t('jobs.detail.percent', { percent })}</Text>
            </>
          )}
        </Stack>
      )}
      {job?.status === 'completed' && (
        <Text>
          {t('jobs.detail.summary', {
            saved: job.stats.saved,
            skipped: job.stats.skipped,
            empty: job.stats.empty,
            failed: job.stats.failed,
          })}
        </Text>
      )}
      {job?.status === 'failed' && job.error && <Alert>{job.error}</Alert>}

      {finished && <SyncJobItemsTable jobId={jobId} />}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.jobs })}>
          {t('jobs.detail.back')}
        </Button>
      </Group>
    </Stack>
  );
}
