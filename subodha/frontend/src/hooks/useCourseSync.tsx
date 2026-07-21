import { useCallback, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { fetchSyncStatus, startCourseSyncJob } from '../api/syncApi';
import type { CourseSyncState } from '../types/sync';

const POLL_MS = 1500;

export interface UseCourseSyncResult {
  states: Record<string, CourseSyncState>;
  syncCourse: (courseId: string, name?: string) => Promise<void>;
}

/**
 * Tracks per-course sync jobs kicked off from the content list — each course
 * row gets its own independent job id + polling loop, keyed by course id.
 */
export function useCourseSync(onSettled?: () => void): UseCourseSyncResult {
  const [states, setStates] = useState<Record<string, CourseSyncState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const setState = useCallback((courseId: string, patch: CourseSyncState) => {
    setStates((prev) => ({ ...prev, [courseId]: patch }));
  }, []);

  const stopPolling = useCallback((courseId: string) => {
    const timer = timersRef.current[courseId];
    if (timer) {
      clearInterval(timer);
      delete timersRef.current[courseId];
    }
  }, []);

  const pollStatus = useCallback(
    async (courseId: string, jobId: string, name?: string) => {
      try {
        const data = await fetchSyncStatus(jobId);
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling(courseId);
          setState(courseId, { status: data.status, jobId, error: data.error ?? '' });
          onSettled?.();
          if (data.status === 'completed') {
            notifications.show({
              title: 'Content synced',
              message: name ? `${name} synced successfully` : `Course ${courseId} synced`,
              color: 'green',
              icon: <IconCircleCheck size={18} />,
            });
          } else {
            notifications.show({
              title: 'Sync failed',
              message: data.error ?? (name ? `${name} failed to sync` : `Course ${courseId} failed`),
              color: 'red',
              icon: <IconAlertTriangle size={18} />,
            });
          }
        }
      } catch (err) {
        stopPolling(courseId);
        setState(courseId, {
          status: 'failed',
          jobId,
          error: String(err),
        });
      }
    },
    [onSettled, setState, stopPolling]
  );

  const syncCourse = useCallback(
    async (courseId: string, name?: string) => {
      setState(courseId, { status: 'running', jobId: '', error: '' });
      try {
        const { jobId } = await startCourseSyncJob(courseId);
        setState(courseId, { status: 'running', jobId, error: '' });
        timersRef.current[courseId] = setInterval(() => pollStatus(courseId, jobId, name), POLL_MS);
        pollStatus(courseId, jobId, name);
      } catch (err) {
        setState(courseId, {
          status: 'failed',
          jobId: '',
          error: String(err),
        });
      }
    },
    [pollStatus, setState]
  );

  return { states, syncCourse };
}
