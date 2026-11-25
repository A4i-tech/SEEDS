import { Group, Text } from '@mantine/core';
import { Children, Fragment, type ReactNode } from 'react';

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" style={{ whiteSpace: 'nowrap' }}>
      {Children.toArray(children).map((child, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <Text span aria-hidden data-separator>
              ·
            </Text>
          )}
          {child}
        </Fragment>
      ))}
    </Group>
  );
}
