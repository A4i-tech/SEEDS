import { Breadcrumbs, Button, Group, Progress, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { ComponentType } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { StatusBadge } from '@shared/components/StatusBadge';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { formatRelativeTime } from '@shared/utils/format';
import type { JobRow, JobStatus } from '../types/job.types';
import type { SyncJob } from '../types/job.types';
import { SyncJobItemsTable } from '../components/SyncJobItemsTable';
import { useJobs } from '../hooks/useJobs';
import { useSyncJob } from '../hooks/useSyncJob';
import classes from './JobDetailScreen.module.css';

function toneFor(status: SyncJob['status'] | undefined): JobStatus {
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  return 'running';
}

function titleFor(t: TFunction, row: JobRow | undefined, job: SyncJob | undefined): string {
  if (row) return row.title;
  if (job?.scope === 'course' && job.course_id) return job.course_id;
  return t('jobs.detail.allCourses');
}

function updatedFor(row: JobRow | undefined, job: SyncJob | undefined): string | undefined {
  if (job) return job.finished_at || job.started_at;
  return row?.updated;
}

function SyncProgress({ job }: { job: SyncJob }) {
  const { t } = useTranslation();
  const total = job.total_courses;
  const percent = Math.round((job.processed / total) * 100);

  return (
    <Stack gap="xs">
      <Text fw={700}>{t('jobs.detail.progressTitle')}</Text>
      {total > 0 && (
        <>
          <Text>{t('jobs.detail.processedOf', { processed: job.processed, total })}</Text>
          <Progress
            value={percent}
            aria-label={t('jobs.detail.progressTitle')}
            classNames={{ root: classes.progressTrack, section: classes.progressFill }}
          />
          <Text size="sm">{t('jobs.detail.percent', { percent })}</Text>
        </>
      )}
    </Stack>
  );
}

function SyncSummary({ job }: { job: SyncJob }) {
  const { t } = useTranslation();
  return (
    <Text>
      {t('jobs.detail.summary', {
        saved: job.stats.saved,
        skipped: job.stats.skipped,
        empty: job.stats.empty,
        failed: job.stats.failed,
      })}
    </Text>
  );
}

function SyncFailure({ job }: { job: SyncJob }) {
  if (!job.error) return <></>;
  return (
    <Text c="red" role="alert">
      {job.error}
    </Text>
  );
}

const STATUS_VIEW: Record<SyncJob['status'], ComponentType<{ job: SyncJob }>> = {
  pending: SyncProgress,
  running: SyncProgress,
  completed: SyncSummary,
  failed: SyncFailure,
};

function SyncStatusView({ job }: { job: SyncJob }) {
  const View = STATUS_VIEW[job.status];
  return <View job={job} />;
}

export function JobDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams({ strict: false });
  const { rows } = useJobs();
  const row = rows.find((r) => r.id === jobId);
  const isRemediation = row?.type === 'make-accessible';
  const { data: job, isLoading, error } = useSyncJob(jobId, !isRemediation);
  const loadError = toApiErrorMessage(error);

  const finished = job?.status === 'completed' || job?.status === 'failed';
  const title = titleFor(t, row, job);
  const updated = updatedFor(row, job);
  const tone = row?.status ?? toneFor(job?.status);

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('jobs.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>

      <Title order={2}>{title}</Title>
      <Group gap="sm">
        <Text c="dimmed">{t(`jobs.types.${row?.type ?? 'course-sync'}`)}</Text>
        <StatusBadge tone={tone} label={t(`jobs.statuses.${tone}`)} />
        {updated && <Text c="dimmed">{formatRelativeTime(updated)}</Text>}
      </Group>

      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}

      {isRemediation && (
        <Stack gap="xs" className={classes.notice}>
          <Text>{t('jobs.detail.remediationNote')}</Text>
          <Button
            variant="outline"
            className={classes.secondaryButton}
            onClick={() => void navigate({ to: '/make-accessible/$jobId', params: { jobId: row.id } })}
          >
            {t('jobs.detail.openRemediation')}
          </Button>
        </Stack>
      )}

      {job && <SyncStatusView job={job} />}

      {finished && <SyncJobItemsTable jobId={jobId} />}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate({ to: routePaths.jobs })}>
          {t('jobs.detail.back')}
        </Button>
      </Group>
    </Stack>
  );
}
