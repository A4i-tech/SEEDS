import { Button, Group, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

export interface SyncHeaderProps {
  running: boolean;
  onSync: () => void;
}

export function SyncHeader({ running, onSync }: SyncHeaderProps) {
  return (
    <Group justify="space-between">
      <Title order={2}>Subodha Sync</Title>
      <Button
        leftSection={<IconRefresh size={18} />}
        onClick={onSync}
        loading={running}
        disabled={running}
        size="md"
      >
        {running ? 'Syncing…' : 'Sync Now'}
      </Button>
    </Group>
  );
}
