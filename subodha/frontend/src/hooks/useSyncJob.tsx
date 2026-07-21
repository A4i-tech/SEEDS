import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCircleCheck, IconPlayerPlay } from '@tabler/icons-react';
import { fetchSyncStatus, startSyncJob } from '../api/syncApi';
import type { NewSyncEvent, SyncEvent, SyncJob } from '../types/sync';

const POLL_MS = 1500;

export interface UseSyncJobResult {
  job: SyncJob | null;
  running: boolean;
  events: SyncEvent[];
  error: string | null;
  startSync: () => Promise<void>;
}

/**
 * Encapsulates starting a Subodha sync job and polling its status until
 * it completes or fails, while collecting a rolling event log.
 */
export function useSyncJob(): UseSyncJobResult {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickKeyRef = useRef<string | null>(null);

  const pushEvent = useCallback((entry: NewSyncEvent) => {
    setEvents((prev) =>
      [{ ...entry, at: new Date().toISOString() }, ...prev].slice(0, 200)
    );
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (jobId: string) => {
      try {
        const data = await fetchSyncStatus(jobId);
        setJob(data);

        if (data.progress) {
          const tickKey = `${data.progress.courseId}:${data.progress.processed}:${data.status}`;
          if (tickKey !== lastTickKeyRef.current) {
            lastTickKeyRef.current = tickKey;
            pushEvent({
              type: 'progress',
              jobId,
              courseId: data.progress.courseId,
              status: data.progress.status,
              processed: data.progress.processed,
              total: data.progress.total,
              result: null,
              error: '',
            });
          }
        }

        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
          setRunning(false);
          if (data.status === 'completed' && data.result) {
            pushEvent({
              type: 'completed',
              jobId,
              courseId: '',
              status: '',
              processed: 0,
              total: 0,
              result: data.result,
              error: '',
            });
            notifications.show({
              title: 'Sync completed',
              message: `Processed ${data.result.processed}/${data.result.totalCourses} courses`,
              color: 'green',
              icon: <IconCircleCheck size={18} />,
            });
          } else {
            pushEvent({
              type: 'failed',
              jobId,
              courseId: '',
              status: '',
              processed: 0,
              total: 0,
              result: null,
              error: data.error ?? 'Unknown error',
            });
            notifications.show({
              title: 'Sync failed',
              message: data.error ?? 'Unknown error',
              color: 'red',
              icon: <IconAlertTriangle size={18} />,
            });
          }
        }
      } catch (err) {
        setError(String(err));
        stopPolling();
        setRunning(false);
      }
    },
    [pushEvent, stopPolling]
  );

  const startSync = useCallback(async () => {
    setError(null);
    setEvents([]);
    setJob(null);
    lastTickKeyRef.current = null;
    setRunning(true);
    try {
      const data = await startSyncJob({ onlyNew: false });
      pushEvent({
        type: 'started',
        jobId: data.jobId,
        courseId: '',
        status: '',
        processed: 0,
        total: 0,
        result: null,
        error: '',
      });
      notifications.show({
        title: 'Sync started',
        message: `Job ${data.jobId}`,
        color: 'blue',
        icon: <IconPlayerPlay size={18} />,
      });
      pollRef.current = setInterval(() => pollStatus(data.jobId), POLL_MS);
      pollStatus(data.jobId);
    } catch (err) {
      setError(String(err));
      setRunning(false);
    }
  }, [pollStatus, pushEvent]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { job, running, events, error, startSync };
}
