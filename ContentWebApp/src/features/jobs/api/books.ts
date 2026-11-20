import { apiClient } from '@shared/services/apiClient';
import { saveBlob } from '@shared/utils/saveBlob';
import { bookSchema } from '../types/job.types';

const bookPath = (bookId: string) => `/textbook-remediation/books/${encodeURIComponent(bookId)}`;

export async function reorderBook(bookId: string, jobIds: string[]) {
  const { data } = await apiClient.put(`${bookPath(bookId)}/order`, { job_ids: jobIds });
  return bookSchema.parse(data);
}

export async function deleteBook(bookId: string) {
  await apiClient.delete(bookPath(bookId));
}

export async function downloadBookArtifact(bookId: string, name: BookFormat, filename: string) {
  const blob = await apiClient.getBlob(`${bookPath(bookId)}/artifacts/${name}`);
  saveBlob(blob, filename);
}

export const BOOK_FORMATS = ['docx', 'pdf', 'tex'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];
