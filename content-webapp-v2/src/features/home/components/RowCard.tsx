import { Anchor, Group, Paper, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';

export function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Anchor component={Link} to={to} fw={700} fz="sm">
      {label}
    </Anchor>
  );
}

export function RowCard({
  badge,
  title,
  subtitle,
  link,
}: {
  badge?: React.ReactNode;
  title: string;
  subtitle?: string;
  link: React.ReactNode;
}) {
  return (
    <Paper p="md" radius="md" h="100%">
      <Group gap="md" wrap="wrap" justify="space-between">
        <Group gap="md" wrap="wrap">
          {badge}
          <Stack gap={0}>
            <Text fw={700}>{title}</Text>
            {subtitle && <Text size="sm">{subtitle}</Text>}
          </Stack>
        </Group>
        {link}
      </Group>
    </Paper>
  );
}
