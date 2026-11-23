import { Anchor, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { openConfirmDialog } from '@shared/components/ConfirmDialog';
import { RowActions } from '@shared/components/RowActions';
import { useRole } from '@features/auth/store/useAuthStore';
import { useDeleteBook } from '../hooks/useJobs';
import type { BookTableRow } from '../utils/bookRows';
import { BookDownloads } from './BookDownloads';
import { ReorderBookModal } from './ReorderBookModal';

export function BookActions({ row }: { row: BookTableRow }) {
  const { t } = useTranslation();
  const role = useRole();
  const [reordering, { open, close }] = useDisclosure();
  const remove = useDeleteBook();
  const { book, chapters } = row;
  const confirmRemove = () =>
    openConfirmDialog({
      title: t('jobs.book.deleteTitle'),
      body: t('jobs.book.deleteBody', { title: book.title, count: chapters.length }),
      confirmLabel: t('jobs.book.deleteConfirm'),
      cancelLabel: t('dialog.cancel'),
      onConfirm: () => remove.mutate(book.book_id),
    });
  return (
    <Stack gap="xs">
      <BookDownloads book={book} total={chapters.length} ready={row.verified === chapters.length} />
      {role === 'tenant' && (
        <>
          <RowActions>
            <Anchor component="button" type="button" variant="rowAction" onClick={open}>
              {t('jobs.book.reorder')}
            </Anchor>
            <Anchor component="button" type="button" variant="rowAction" c="red" onClick={confirmRemove}>
              {t('jobs.book.delete')}
            </Anchor>
          </RowActions>
          <ReorderBookModal opened={reordering} onClose={close} book={book} chapters={chapters} />
        </>
      )}
    </Stack>
  );
}
