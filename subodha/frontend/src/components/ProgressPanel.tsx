import { Badge, Group, Paper, Progress, Text } from '@mantine/core';
import { StatsGrid } from './StatsGrid';
import { computePercent, jobStatusLabel } from '../utils/phase';
import type { SyncJob, SyncStats } from '../types/sync';

export interface ProgressPanelProps {
  job: SyncJob | null;
  running: boolean;
  stats: SyncStats | null;
  isDone: boolean;
  isFailed: boolean;
}

export function ProgressPanel({ job, running, stats, isDone, isFailed }: ProgressPanelProps) {
  const percent = computePercent(job?.progress ?? null);

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={500}>{jobStatusLabel(job)}</Text>
        <Badge
          color={isDone ? 'green' : isFailed ? 'red' : running ? 'blue' : 'gray'}
          variant="light"
        >
          {job?.status ?? 'idle'}
        </Badge>
      </Group>
      <Progress
        value={percent}
        size="xl"
        radius="xl"
        striped={running && !isDone}
        animated={running && !isDone}
        color={isFailed ? 'red' : isDone ? 'green' : 'blue'}
      />
      <Text ta="right" size="sm" c="dimmed" mt={4}>
        {percent}%
        {job?.progress?.total ? ` (${job.progress.processed}/${job.progress.total})` : ''}
      </Text>

      {stats && <StatsGrid stats={stats} />}
    </Paper>
  );
}
