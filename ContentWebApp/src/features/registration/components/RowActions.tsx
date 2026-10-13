import { Anchor, Group } from '@mantine/core';

export function RowActions({ actions }: { actions: { label: string; onClick: () => void }[] }) {
  return (
    <Group gap="xs">
      {actions.map(({ label, onClick }) => (
        <Anchor key={label} component="button" type="button" fw={700} onClick={onClick}>
          {label}
        </Anchor>
      ))}
    </Group>
  );
}
