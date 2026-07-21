import { Paper, Text } from '@mantine/core';

export interface StatBoxProps {
  label: string;
  value: number;
  color: string;
}

export function StatBox({ label, value, color }: StatBoxProps) {
  return (
    <Paper withBorder p="xs" radius="md" ta="center">
      <Text size="xl" fw={700} c={color}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  );
}
