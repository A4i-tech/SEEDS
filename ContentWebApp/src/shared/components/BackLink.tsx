import { Anchor, Group, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function BackLink({ to, label, current }: { to: string; label: string; current?: string }) {
  return (
    <Group gap={6} wrap="wrap" align="center" style={{ alignSelf: 'flex-start' }}>
      <Anchor
        component={Link}
        to={to}
        size="sm"
        variant="rowAction"
        display="inline-flex"
        style={{ alignItems: 'center', gap: 4 }}
      >
        <ArrowLeft size={16} aria-hidden />
        {label}
      </Anchor>
      {current && (
        <>
          <Text size="sm" c="dimmed" aria-hidden>
            /
          </Text>
          <Text size="sm" aria-current="page">
            {current}
          </Text>
        </>
      )}
    </Group>
  );
}
