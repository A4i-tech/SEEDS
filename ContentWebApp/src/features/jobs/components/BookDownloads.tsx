import { Button, Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BOOK_FORMATS } from '../api/books';
import { useDownloadBook } from '../hooks/useJobs';
import type { Book } from '../types/job.types';

export function BookDownloads({ book, total, ready }: { book: Book; total: number; ready: boolean }) {
  const { t } = useTranslation();
  const hintId = useId();
  const download = useDownloadBook(book);
  const buildingFormat = download.isPending ? download.variables : undefined;
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        {BOOK_FORMATS.map((format) => {
          const building = buildingFormat === format;
          return (
            <Button
              key={format}
              variant="outline"
              size="compact-sm"
              disabled={!ready}
              loading={building}
              aria-busy={building || undefined}
              aria-describedby={hintId}
              onClick={() => download.mutate(format)}
            >
              {t(`jobs.book.formats.${format}`)}
            </Button>
          );
        })}
      </Group>
      <Text id={hintId} size="xs" c="dimmed">
        {t('jobs.book.downloadsHint', { count: total })}
      </Text>
      <VisuallyHidden role="status">
        {buildingFormat && t('jobs.book.building', { format: t(`jobs.book.formats.${buildingFormat}`) })}
      </VisuallyHidden>
    </Stack>
  );
}
