import { Alert, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { SyncFailure } from '../types/sync';

export interface FailuresPanelProps {
  failures: SyncFailure[];
}

export function FailuresPanel({ failures }: FailuresPanelProps) {
  if (failures.length === 0) return null;

  return (
    <Paper withBorder p="md" radius="md">
      <Group mb="xs">
        <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
        <Text fw={500}>Failure reasons ({failures.length})</Text>
      </Group>
      <ScrollArea h={Math.min(240, failures.length * 48)}>
        <Stack gap={6}>
          {failures.map((f) => (
            <Alert key={f.courseId} color="red" variant="light" py={6}>
              <Text size="sm" fw={600}>
                {f.courseId}
              </Text>
              <Text size="xs" c="dimmed">
                {f.error}
              </Text>
            </Alert>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
