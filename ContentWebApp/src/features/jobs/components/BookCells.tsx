import { ActionIcon, Badge, Group, Progress, Stack, Text, VisuallyHidden } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookTableRow } from '../utils/bookRows';

export function BookTitleCell({ row, onToggle }: { row: BookTableRow; onToggle: () => void }) {
  const { t } = useTranslation();
  const { book, chapters, expanded } = row;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <ActionIcon
        variant="outline"
        size="md"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={t('jobs.book.toggle', { title: book.title })}
      >
        <Chevron size={18} aria-hidden />
      </ActionIcon>
      <Stack gap={2}>
        <Text size="sm" variant="rowTitle">
          {book.title}
        </Text>
        <Group gap="xs">
          <Badge variant="light" size="sm">
            {t('jobs.book.tag')}
          </Badge>
          <Text size="xs" c="dimmed">
            {t('jobs.book.chapters', { count: chapters.length })}
          </Text>
          <Text size="xs" c="dimmed">
            {book.language}
          </Text>
        </Group>
      </Stack>
    </Group>
  );
}

export function BookStageCell({ row }: { row: BookTableRow }) {
  const { t } = useTranslation();
  const total = row.chapters.length;
  return (
    <Stack gap={6} w="100%">
      <Text size="xs">{t('jobs.book.verifiedOf', { verified: row.verified, total })}</Text>
      <Progress value={(row.verified / total) * 100} size="sm" aria-label={t('jobs.book.progress')} />
    </Stack>
  );
}

export function ChapterTitleCell({ position, children }: { position: number; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="flex-start"
      ms={16}
      ps={12}
      style={{ borderInlineStart: '3px solid var(--seeds-border-default)' }}
    >
      <Text size="sm" c="dimmed">
        <VisuallyHidden component="span">{t('jobs.book.chapter')}</VisuallyHidden>
        {position}
      </Text>
      {children}
    </Group>
  );
}
