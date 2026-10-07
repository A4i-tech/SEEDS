import { Badge } from '@mantine/core';
import classes from './StatusBadge.module.css';

export type StatusTone = 'running' | 'needs-review' | 'done' | 'failed';

const toneClass: Record<StatusTone, string> = {
  running: classes.running,
  'needs-review': classes.needsReview,
  done: classes.done,
  failed: classes.failed,
};

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <Badge className={toneClass[tone]} radius="xl" size="md">
      {label}
    </Badge>
  );
}
