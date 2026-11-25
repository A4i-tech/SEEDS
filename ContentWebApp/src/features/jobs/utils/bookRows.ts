import type { Book, JobRow, JobStatus, JobType } from '../types/job.types';

export type BookTableRow = {
  kind: 'book';
  id: string;
  book: Book;
  chapters: JobRow[];
  status: JobStatus;
  verified: number;
  updated: string;
  expanded: boolean;
  readOnly: boolean;
};

export type JobsTableRow =
  | { kind: 'job'; id: string; job: JobRow }
  | { kind: 'chapter'; id: string; position: number; job: JobRow }
  | BookTableRow;

export interface RowFilters {
  query: string;
  type: 'all' | JobType;
  status: 'all' | JobStatus;
}

export function bookStatus(chapters: JobRow[]): JobStatus {
  if (chapters.some((chapter) => chapter.status === 'running')) return 'running';
  return chapters.every((chapter) => chapter.status === 'done') ? 'done' : 'needs-review';
}

export function buildRows(
  rows: JobRow[],
  books: Book[],
  expanded: ReadonlySet<string>,
  filters: RowFilters,
  readOnly: boolean,
): JobsTableRow[] {
  const q = filters.query.trim().toLowerCase();
  const remediation = Object.fromEntries(rows.filter((row) => row.type === 'make-accessible').map((row) => [row.id, row]));
  const grouped = new Set<string>();
  const bookRows: JobsTableRow[] = [];

  for (const book of [...books].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const chapters = book.job_ids.map((id) => remediation[id]);
    chapters.forEach((chapter) => grouped.add(chapter.id));
    if (chapters.length === 0) continue;
    const status = bookStatus(chapters);
    const matches =
      (filters.type === 'all' || filters.type === 'make-accessible') &&
      (filters.status === 'all' || status === filters.status) &&
      (!q || book.title.toLowerCase().includes(q));
    if (!matches) continue;
    const open = readOnly || expanded.has(book.book_id);
    bookRows.push({
      kind: 'book',
      id: `book:${book.book_id}`,
      book,
      chapters,
      status,
      verified: chapters.filter((chapter) => chapter.status === 'done').length,
      updated: chapters.reduce((latest, chapter) => (chapter.updated > latest ? chapter.updated : latest), chapters[0].updated),
      expanded: open,
      readOnly,
    });
    if (open) {
      chapters.forEach((job, index) => bookRows.push({ kind: 'chapter', id: `chapter:${job.id}`, position: index + 1, job }));
    }
  }

  const singles: JobsTableRow[] = rows
    .filter(
      (row) =>
        !(row.type === 'make-accessible' && grouped.has(row.id)) &&
        (filters.type === 'all' || row.type === filters.type) &&
        (filters.status === 'all' || row.status === filters.status) &&
        (!q || row.title.toLowerCase().includes(q)),
    )
    .map((job) => ({ kind: 'job', id: `job:${job.type}:${job.id}`, job }));

  return [...bookRows, ...singles];
}
