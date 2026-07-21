import { Alert, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { SyncHeader } from './SyncHeader';
import { ProgressPanel } from './ProgressPanel';
import { FailuresPanel } from './FailuresPanel';
import { LiveUpdatesPanel } from './LiveUpdatesPanel';
import { useSyncJob } from '../hooks/useSyncJob';

export function SyncAllPage() {
  const { job, running, events, error, startSync } = useSyncJob();

  const stats = job?.result?.stats ?? null;
  const failures = job?.result?.permanentFailures ?? [];
  const isDone = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  return (
    <Stack gap="lg">
      <SyncHeader running={running} onSync={startSync} />

      {error && (
        <Alert color="red" title="Connection error" icon={<IconAlertTriangle size={18} />}>
          {error}
        </Alert>
      )}

      <ProgressPanel job={job} running={running} stats={stats} isDone={isDone} isFailed={isFailed} />

      <FailuresPanel failures={failures} />

      <LiveUpdatesPanel events={events} />
    </Stack>
  );
}
