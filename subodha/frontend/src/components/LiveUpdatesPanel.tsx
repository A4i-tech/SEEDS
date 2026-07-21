import { Divider, Group, Paper, ScrollArea, Text, Timeline } from '@mantine/core';
import { IconClock, IconListCheck } from '@tabler/icons-react';
import { eventColor, eventTitle } from '../utils/phase';
import type { SyncEvent } from '../types/sync';

export interface LiveUpdatesPanelProps {
  events: SyncEvent[];
}

export function LiveUpdatesPanel({ events }: LiveUpdatesPanelProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group mb="xs">
        <IconListCheck size={18} />
        <Text fw={500}>Live updates</Text>
      </Group>
      <Divider mb="sm" />
      <ScrollArea h={320}>
        {events.length === 0 ? (
          <Text size="sm" c="dimmed">
            No updates yet. Click “Sync Now” to start.
          </Text>
        ) : (
          <Timeline active={0} bulletSize={20} lineWidth={2}>
            {events.map((ev, i) => (
              <Timeline.Item
                key={i}
                bullet={<IconClock size={12} />}
                title={eventTitle(ev)}
                color={eventColor(ev)}
              >
                <Text size="xs" c="dimmed">
                  {new Date(ev.at).toLocaleTimeString()}
                </Text>
                {ev.type === 'progress' && (
                  <Text size="sm">
                    {ev.courseId} — {ev.status} ({ev.processed}/{ev.total})
                  </Text>
                )}
                {ev.type === 'completed' && ev.result && (
                  <Text size="sm">
                    Processed {ev.result.processed}/{ev.result.totalCourses} courses
                  </Text>
                )}
                {ev.type === 'failed' && (
                  <Text size="sm" c="red">
                    {ev.error}
                  </Text>
                )}
                {ev.type === 'started' && <Text size="sm">Job {ev.jobId}</Text>}
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </ScrollArea>
    </Paper>
  );
}
