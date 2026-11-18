import { Badge, Group, Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { RemediationJob } from '../types/job.types';

const STAGES = ['ocr', 'review', 'docx'] as const;
const DONE_STATUSES = new Set(['ready_to_review', 'in_review', 'verified']);

const TONES = {
  done: { bg: 'var(--seeds-badge-easy-bg)', c: 'var(--seeds-badge-easy-text)' },
  current: { bg: 'var(--seeds-badge-subject-bg)', c: 'var(--seeds-badge-subject-text)' },
  pending: { bg: 'var(--seeds-badge-neutral-bg)', c: 'var(--seeds-badge-neutral-text)' },
};

export function StageProgress({
  job,
}: {
  job: Pick<RemediationJob, 'status' | 'stage_index' | 'stage_count' | 'progress'>;
}) {
  const { t } = useTranslation();
  const done = DONE_STATUSES.has(job.status);
  const running = job.status === 'running';
  const { message, percent } = job.progress;

  return (
    <Stack gap={6} w="100%">
      <Group gap={4} role="status" aria-label={t('jobs.stageLabel', { index: job.stage_index, count: job.stage_count })}>
        {STAGES.map((stage, index) => {
          const current = !done && running && index + 1 === job.stage_index;
          const reached = !current && (done || index < job.stage_index);
          const tone = current ? TONES.current : reached ? TONES.done : TONES.pending;
          return (
            <Badge
              key={stage}
              {...tone}
              aria-current={current ? 'step' : undefined}
              fz="xs"
              radius="xl"
              size="md"
              fw={current ? 800 : 600}
              style={current ? { outline: '2px solid var(--seeds-badge-subject-bg)', outlineOffset: 2 } : undefined}
            >
              {t(`jobs.stages.${stage}`)}
            </Badge>
          );
        })}
      </Group>
      {running && <Progress value={percent} size="sm" aria-label={t('jobs.progressLabel')} />}
      {running && message && (
        <Text size="xs" c="dimmed" truncate title={message}>
          {message} ({percent}%)
        </Text>
      )}
    </Stack>
  );
}
