import type { SyncEvent, SyncJob, SyncProgress } from '../types/sync';

// Backend has no job-wide "phase" concept, just status + per-course progress.
export function jobStatusLabel(job: SyncJob | null): string {
  if (!job) return 'Waiting';
  switch (job.status) {
    case 'running':
      return job.progress && job.progress.courseId
        ? `Processing ${job.progress.courseId} (${job.progress.status})…`
        : 'Processing courses…';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return job.status;
  }
}

export function computePercent(progress: SyncProgress | null): number {
  if (!progress || !progress.total) return 0;
  const pct = Math.round((progress.processed / progress.total) * 100);
  return Math.min(99, Math.max(0, pct));
}

export function eventTitle(ev: SyncEvent): string {
  switch (ev.type) {
    case 'started':
      return 'Sync started';
    case 'progress':
      return ev.courseId ? `${ev.courseId} → ${ev.status}` : 'Progress update';
    case 'completed':
      return 'Sync completed';
    case 'failed':
      return 'Sync failed';
    default:
      return ev.type;
  }
}

export function eventColor(ev: SyncEvent): string {
  if (ev.type === 'completed') return 'green';
  if (ev.type === 'failed') return 'red';
  if (ev.type === 'started') return 'blue';
  return 'gray';
}
