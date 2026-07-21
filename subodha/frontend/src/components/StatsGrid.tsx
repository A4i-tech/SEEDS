import { SimpleGrid } from '@mantine/core';
import { StatBox } from './StatBox';
import type { SyncStats } from '../types/sync';

export interface StatsGridProps {
  stats: SyncStats;
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} mt="md">
      <StatBox label="Saved" value={stats.saved} color="green" />
      <StatBox label="Skipped" value={stats.skipped} color="gray" />
      <StatBox label="Empty" value={stats.empty} color="yellow" />
      <StatBox label="Failed" value={stats.failed} color="red" />
    </SimpleGrid>
  );
}
