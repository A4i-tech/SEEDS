import { Badge } from '@mantine/core';

export type StatusTone = 'running' | 'needs-review' | 'done' | 'failed';

const TONES: Record<StatusTone, { bg: string; c: string }> = {
  running: { bg: 'var(--seeds-badge-subject-bg)', c: 'var(--seeds-badge-subject-text)' },
  'needs-review': { bg: 'var(--seeds-badge-warning-bg)', c: 'var(--seeds-badge-warning-text)' },
  done: { bg: 'var(--seeds-badge-easy-bg)', c: 'var(--seeds-badge-easy-text)' },
  failed: { bg: 'var(--seeds-badge-hard-bg)', c: 'var(--seeds-badge-hard-text)' },
};

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <Badge {...TONES[tone]} lts={2} radius="xl" size="md">
      {label}
    </Badge>
  );
}
