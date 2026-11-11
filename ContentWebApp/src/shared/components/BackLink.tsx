import { Anchor, Group } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <ArrowLeft size={16} aria-hidden />
      <Anchor component={Link} to={to} size="sm" variant="rowAction">
        {label}
      </Anchor>
    </Group>
  );
}
