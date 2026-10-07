import { Breadcrumbs, Button, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { routePaths } from '@app/navigation/routePaths';
import { StatusBadge } from '@shared/components/StatusBadge';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { formatRelativeTime } from '@shared/utils/format';
import type { JobStatus } from '../types/job.types';
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

export function JobDetailScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobId = '' } = useParams();
  const { rows } = useJobs();
  const row = rows.find((r) => r.id === jobId);
  const isRemediation = row?.type === 'make-accessible';
  const { data: job, isLoading, error } = useSyncJob(jobId, !isRemediation);
  const loadError = toApiErrorMessage(error);

  const running = !!job && (job.status === 'pending' || job.status === 'running');
  const done = !!job && job.status === 'completed';
  const failed = !!job && job.status === 'failed';
  const title =
    row?.title ?? (job && job.scope === 'course' && job.course_id ? job.course_id : t('jobs.detail.allCourses'));
  const updated = job ? (job.finished_at ?? job.started_at ?? '') : (row?.updated ?? '');
  const tone = row?.status ?? toneFor(job?.status);
  const total = job?.total_courses ?? null;
  const percent = job && total ? Math.round((job.processed / total) * 100) : null;

  return (
    <Stack gap="md">
      <Breadcrumbs aria-label="Breadcrumb">
        <Text>{t('jobs.title')}</Text>
        <Text>{title}</Text>
      </Breadcrumbs>

      <Title order={2}>{title}</Title>
      <Group gap="sm">
        <Text c="dimmed">{row ? t(`jobs.types.${row.type}`) : t('jobs.types.course-sync')}</Text>
        <StatusBadge tone={tone} label={t(`jobs.statuses.${tone}`)} />
        {updated !== '' && <Text c="dimmed">{formatRelativeTime(updated)}</Text>}
      </Group>

      {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}
      {loadError && (
        <Text c="red" role="alert">
          {loadError}
        </Text>
      )}

      {isRemediation && row && (
        <Stack gap="xs" className={classes.notice}>
          <Text>{t('jobs.detail.remediationNote')}</Text>
          <Button
            variant="outline"
            className={classes.secondaryButton}
            onClick={() => void navigate(`${routePaths.makeAccessible}/${row.id}`)}
          >
            {t('jobs.detail.openRemediation')}
          </Button>
        </Stack>
      )}

      {running && job && (
        <Stack gap="xs">
          <Text fw={700}>{t('jobs.detail.progressTitle')}</Text>
          {total !== null && <Text>{t('jobs.detail.processedOf', { processed: job.processed, total })}</Text>}
          {percent !== null && (
            <Progress
              value={percent}
              aria-label={t('jobs.detail.progressTitle')}
              classNames={{ root: classes.progressTrack, section: classes.progressFill }}
            />
          )}
          {percent !== null && <Text size="sm">{t('jobs.detail.percent', { percent })}</Text>}
        </Stack>
      )}

      {done && job && (
        <Text>
          {t('jobs.detail.summary', {
            saved: job.stats.saved,
            skipped: job.stats.skipped,
            empty: job.stats.empty,
            failed: job.stats.failed,
          })}
        </Text>
      )}

      {failed && job?.error && (
        <Text c="red" role="alert">
          {job.error}
        </Text>
      )}

      {(done || failed) && <SyncJobItemsTable jobId={jobId} />}

      <Group gap="md">
        <Button variant="subtle" onClick={() => void navigate(routePaths.jobs)}>
          {t('jobs.detail.back')}
        </Button>
      </Group>
    </Stack>
  );
}
