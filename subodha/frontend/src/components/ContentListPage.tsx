import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconRefresh, IconSearch } from '@tabler/icons-react';
import { fetchContentList } from '../api/syncApi';
import { useCourseSync } from '../hooks/useCourseSync';
import type { ContentItem } from '../types/sync';

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

const SYNC_BADGE = {
  failed: { color: 'red', label: 'Sync failed' },
  synced: { color: 'green', label: 'Synced' },
  never: { color: 'gray', label: 'Never synced' },
} as const;

const COLUMN_LABELS = ['Name', 'Org / Number', 'Status', 'Last synced', 'Action'] as const;
const DEFAULT_COLUMN_WIDTHS = [260, 220, 120, 160, 140];
const MIN_COLUMN_WIDTH = 60;

export function ContentListPage() {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContentList();
      setContent(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { states, syncCourse } = useCourseSync();

  const [columnWidths, setColumnWidths] = useState<number[]>(DEFAULT_COLUMN_WIDTHS);
  const resizingRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    const resizing = resizingRef.current;
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newWidth = Math.max(MIN_COLUMN_WIDTH, resizing.startWidth + delta);
    setColumnWidths((widths) => widths.map((w, i) => (i === resizing.index ? newWidth : w)));
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
  }, [handleResizeMouseMove]);

  const handleResizeMouseDown = useCallback(
    (index: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = { index, startX: e.clientX, startWidth: columnWidths[index] };
      document.addEventListener('mousemove', handleResizeMouseMove);
      document.addEventListener('mouseup', handleResizeMouseUp);
    },
    [columnWidths, handleResizeMouseMove, handleResizeMouseUp]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [handleResizeMouseMove, handleResizeMouseUp]);

  const filtered = content.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = [c.name, c.id, c.org, c.number].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={3}>Content</Title>
        <Group>
          <Tooltip label="Refresh list">
            <ActionIcon variant="light" onClick={load} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <TextInput
        placeholder="Search by name, id, org, or course number…"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="sm"
      />

      {error && (
        <Alert color="red" title="Failed to load content" icon={<IconAlertTriangle size={18} />} mb="sm">
          {error}
        </Alert>
      )}

      {loading && content.length === 0 ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : (
        <ScrollArea h={520}>
          <Table stickyHeader striped highlightOnHover verticalSpacing="xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {columnWidths.map((width, i) => (
                <col key={COLUMN_LABELS[i]} style={{ width }} />
              ))}
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                {COLUMN_LABELS.map((label, i) => (
                  <Table.Th key={label} style={{ textAlign: 'center', position: 'relative' }}>
                    {label}
                    {i < COLUMN_LABELS.length - 1 && (
                      <div
                        onMouseDown={handleResizeMouseDown(i)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          bottom: 0,
                          width: 6,
                          cursor: 'col-resize',
                          userSelect: 'none',
                        }}
                      />
                    )}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((c) => {
                const state = states[c.id];
                const running = state?.status === 'running';
                const syncBadgeKey =
                  state?.status === 'failed'
                    ? 'failed'
                    : state?.status === 'completed'
                    ? 'synced'
                    : c.synced
                    ? 'synced'
                    : 'never';
                const { color: badgeColor, label: badgeLabel } = SYNC_BADGE[syncBadgeKey];

                return (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {c.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{c.org}</Text>
                      <Text size="xs" c="dimmed">
                        {c.number}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={badgeColor} variant="light">
                        {badgeLabel}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(c.lastSyncedAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="filled"
                        color="blue"
                        loading={running}
                        onClick={() => syncCourse(c.id, c.name)}
                        aria-label={`Sync ${c.name}`}
                      >
                        <IconRefresh size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="md">
                      No content matches your search.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Paper>
  );
}
