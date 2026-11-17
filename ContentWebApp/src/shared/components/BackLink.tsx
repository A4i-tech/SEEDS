import { Anchor } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Anchor
      component={Link}
      to={to}
      size="sm"
      variant="rowAction"
      display="inline-flex"
      style={{ alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
    >
      <ArrowLeft size={16} aria-hidden />
      {label}
    </Anchor>
  );
}
