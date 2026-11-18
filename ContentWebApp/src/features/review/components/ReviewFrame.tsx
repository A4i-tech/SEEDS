import { ScrollArea } from '@mantine/core';
import type { ReactNode } from 'react';
import type { FrameSync } from '../hooks/useSyncedScroll';

export function ReviewFrame({ label, sync, children }: { label: string; sync: FrameSync; children: ReactNode }) {
  return (
    <ScrollArea
      h="70vh"
      type="auto"
      viewportRef={sync.viewportRef}
      viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': label, onScroll: sync.onScroll }}
    >
      {children}
    </ScrollArea>
  );
}
