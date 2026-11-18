import { Box, Button, Group, Text, VisuallyHidden } from '@mantine/core';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_PDF_MB } from '../utils/upload';

export interface OrganiserItem {
  id: string;
  name: string;
  sizeMb?: number;
}

type Action = 'up' | 'down' | 'remove';

interface BookOrganiserProps {
  items: OrganiserItem[];
  onChange: (items: OrganiserItem[]) => void;
  allowRemove: boolean;
}

// oxlint-disable-next-line react/only-export-components
export const sortByName = (items: OrganiserItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

export function BookOrganiser({ items, onChange, allowRemove }: BookOrganiserProps) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [announcement, setAnnouncement] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef<{ id: string; actions: Action[] } | null>(null);
  const total = items.length;

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, actions } = pendingFocus.current;
    pendingFocus.current = null;
    actions
      .map((action) => buttonRefs.current[`${id}:${action}`])
      .find((button) => button && !button.disabled)
      ?.focus();
  }, [items]);

  const move = (from: number, to: number, focus: Action[] | null) => {
    if (to < 0 || to >= total) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    pendingFocus.current = focus && { id: item.id, actions: focus };
    setAnnouncement(t('bookOrganiser.moved', { name: item.name, position: to + 1, total }));
    onChange(next);
  };

  const remove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    const neighbour = next[Math.min(index, next.length - 1)];
    pendingFocus.current = neighbour ? { id: neighbour.id, actions: ['remove'] } : null;
    setAnnouncement(t('bookOrganiser.removed', { name: items[index].name, count: next.length }));
    onChange(next);
  };

  const sort = () => {
    setAnnouncement(t('bookOrganiser.sorted'));
    onChange(sortByName(items));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    if (event.key === 'ArrowUp') move(index, index - 1, ['up', 'down']);
    else move(index, index + 1, ['down', 'up']);
  };

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const setButtonRef = (id: string, action: Action) => (element: HTMLButtonElement | null) => {
    buttonRefs.current[`${id}:${action}`] = element;
  };

  return (
    <div>
      <Group justify="space-between" align="center" mb="xs">
        <div>
          <Text fw={700}>{t('bookOrganiser.title')}</Text>
          <Text size="sm" c="dimmed">
            {t('bookOrganiser.hint')}
          </Text>
        </div>
        <Button variant="default" size="compact-md" onClick={sort}>
          {t('bookOrganiser.sort')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        {t('bookOrganiser.keyboardHint')}
      </Text>
      <Box component="ol" m={0} p={0} style={{ listStyle: 'none' }} aria-label={t('bookOrganiser.listLabel')}>
        {items.map((item, index) => {
          const { id, name, sizeMb } = item;
          const tooBig = sizeMb !== undefined && sizeMb > MAX_PDF_MB;
          const problemId = `${idPrefix}-${id}-problem`;
          const dropTarget = dragOver === index && dragFrom !== index;
          const isFirst = index === 0;
          const isLast = index === total - 1;
          return (
            <Group
              component="li"
              key={id}
              wrap="nowrap"
              gap="md"
              px="md"
              py="sm"
              mt={index > 0 ? 'xs' : 0}
              bdrs="md"
              bd={`1px solid ${tooBig ? 'var(--seeds-badge-hard-text)' : 'var(--seeds-card-border)'}`}
              bg={dropTarget ? 'var(--seeds-subnav-bg-active)' : 'var(--seeds-bg-surface)'}
              style={{
                cursor: 'grab',
                opacity: dragFrom === index ? 0.5 : 1,
                ...(dropTarget && { borderTop: '4px solid var(--seeds-btn-primary-bg)' }),
              }}
              draggable
              data-drop-target={dropTarget || undefined}
              aria-describedby={tooBig ? problemId : undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onDragStart={(event) => {
                setDragFrom(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(event) => {
                if (dragFrom === null) return;
                event.preventDefault();
                setDragOver(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragFrom;
                endDrag();
                if (from !== null && from !== index) move(from, index, null);
              }}
              onDragEnd={endDrag}
            >
              <Text component="span" fw={700} c="dimmed" miw="2ch" aria-hidden="true">
                {index + 1}
              </Text>
              <Box flex={1} miw={0} style={{ overflowWrap: 'anywhere' }}>
                <Text fw={600}>{name}</Text>
                {sizeMb !== undefined && (
                  <Text size="sm" c="dimmed">
                    {t('bookOrganiser.size', { size: sizeMb.toFixed(1) })}
                  </Text>
                )}
                {tooBig && (
                  <Text id={problemId} size="sm" fw={600} c="var(--seeds-badge-hard-text)">
                    {t('bookOrganiser.tooBig', { name, size: sizeMb.toFixed(1), limit: MAX_PDF_MB })}
                  </Text>
                )}
              </Box>
              <Group gap="xs" wrap="nowrap">
                <Button
                  variant="default"
                  size="compact-md"
                  ref={setButtonRef(id, 'up')}
                  disabled={isFirst}
                  aria-label={
                    isFirst
                      ? t('bookOrganiser.moveUpFirstLabel', { name })
                      : t('bookOrganiser.moveUpLabel', { name, position: index, total })
                  }
                  onClick={() => move(index, index - 1, ['up', 'down'])}
                >
                  {t('bookOrganiser.moveUp')}
                </Button>
                <Button
                  variant="default"
                  size="compact-md"
                  ref={setButtonRef(id, 'down')}
                  disabled={isLast}
                  aria-label={
                    isLast
                      ? t('bookOrganiser.moveDownLastLabel', { name })
                      : t('bookOrganiser.moveDownLabel', { name, position: index + 2, total })
                  }
                  onClick={() => move(index, index + 1, ['down', 'up'])}
                >
                  {t('bookOrganiser.moveDown')}
                </Button>
                {allowRemove && (
                  <Button
                    variant="default"
                    size="compact-md"
                    ref={setButtonRef(id, 'remove')}
                    aria-label={t('bookOrganiser.removeLabel', { name })}
                    onClick={() => remove(index)}
                  >
                    {t('bookOrganiser.remove')}
                  </Button>
                )}
              </Group>
            </Group>
          );
        })}
      </Box>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </div>
  );
}
