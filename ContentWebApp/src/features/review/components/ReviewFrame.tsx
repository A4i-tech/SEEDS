import { ScrollArea } from '@mantine/core';
import type { ReactNode } from 'react';

export function ReviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollArea h="70vh" type="auto" viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': label }}>
      {children}
    </ScrollArea>
  );
}
