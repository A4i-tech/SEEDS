import { Alert, Button, Group, Modal, Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOrganiser, type OrganiserItem } from '@shared/components/BookOrganiser';
import { ApiError } from '@shared/services/apiClient';
import { useReorderBook } from '../hooks/useJobs';
import { jobKeys, type Book, type JobRow } from '../types/job.types';

function ReorderForm({ book, chapters, onClose }: { book: Book; chapters: JobRow[]; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const reorder = useReorderBook();
  const [items, setItems] = useState<OrganiserItem[]>(() => chapters.map((chapter) => ({ id: chapter.id, name: chapter.title })));
  const { error } = reorder;
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: jobKeys.remediation });
    onClose();
  };
  return (
    <Stack gap="md">
      <BookOrganiser items={items} onChange={setItems} allowRemove={false} />
      {error && (
        <Alert role="alert" color="red">
          {error.message}
        </Alert>
      )}
      <Group justify="flex-end" gap="sm">
        {error instanceof ApiError && error.status === 422 && (
          <Button variant="outline" onClick={reload}>
            {t('jobs.book.reload')}
          </Button>
        )}
        <Button variant="subtle" onClick={onClose}>
          {t('dialog.cancel')}
        </Button>
        <Button
          loading={reorder.isPending}
          onClick={() =>
            reorder.mutate({ bookId: book.book_id, jobIds: items.map((item) => item.id) }, { onSuccess: onClose })
          }
        >
          {t('jobs.book.saveOrder')}
        </Button>
      </Group>
    </Stack>
  );
}

export function ReorderBookModal({
  opened,
  onClose,
  book,
  chapters,
}: {
  opened: boolean;
  onClose: () => void;
  book: Book;
  chapters: JobRow[];
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={t('jobs.book.reorderTitle', { title: book.title })} centered>
      <ReorderForm book={book} chapters={chapters} onClose={onClose} />
    </Modal>
  );
}
