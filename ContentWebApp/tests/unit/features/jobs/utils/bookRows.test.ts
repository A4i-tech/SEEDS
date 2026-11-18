import { describe, expect, it } from 'vitest'

import type { Book, JobRow, JobStatus } from '@features/jobs/types/job.types'
import { bookStatus, buildRows, type RowFilters } from '@features/jobs/utils/bookRows'

const row = (id: string, status: JobStatus, over: Partial<JobRow> = {}): JobRow => ({
  id,
  title: `${id}.pdf`,
  subtitle: '',
  type: 'make-accessible',
  status,
  updated: '2026-01-02',
  remediation: null,
  ...over,
})

const book = (id: string, jobIds: string[], over: Partial<Book> = {}): Book => ({
  book_id: id,
  title: `Book ${id}`,
  language: 'en',
  job_ids: jobIds,
  created_at: '2026-01-01',
  ...over,
})

const all: RowFilters = { query: '', type: 'all', status: 'all' }
const ids = (rows: ReturnType<typeof buildRows>) => rows.map((r) => r.id)

describe('bookStatus', () => {
  it('is running while any chapter runs', () => {
    expect(bookStatus([row('a', 'done'), row('b', 'running')])).toBe('running')
  })

  it('is done when every chapter is verified', () => {
    expect(bookStatus([row('a', 'done'), row('b', 'done')])).toBe('done')
  })

  it('needs review otherwise', () => {
    expect(bookStatus([row('a', 'done'), row('b', 'needs-review')])).toBe('needs-review')
    expect(bookStatus([row('a', 'done'), row('b', 'failed')])).toBe('needs-review')
  })
})

describe('buildRows', () => {
  const jobs = [row('a', 'done'), row('b', 'done'), row('c', 'done'), row('a', 'done', { type: 'course-sync' })]

  it('puts the newest book first, then singles, and hides chapters until expanded', () => {
    const books = [book('old', ['a']), book('new', ['b', 'c'], { created_at: '2026-02-01' })]
    expect(ids(buildRows(jobs, books, new Set(), all, false))).toEqual(['book:new', 'book:old', 'job:course-sync:a'])
  })

  it('lists chapters in job_ids order and skips ids that are not loaded', () => {
    const books = [book('x', ['c', 'missing', 'a'])]
    const rows = buildRows(jobs, books, new Set(['x']), all, false)
    expect(ids(rows)).toEqual(['book:x', 'chapter:c', 'chapter:a', 'job:make-accessible:b', 'job:course-sync:a'])
    expect(rows[1]).toMatchObject({ kind: 'chapter', position: 1 })
    expect(rows[2]).toMatchObject({ kind: 'chapter', position: 2 })
  })

  it('drops a book with no loaded chapters', () => {
    expect(ids(buildRows([], [book('x', ['gone'])], new Set(), all, false))).toEqual([])
  })

  it('derives the book fields from its chapters', () => {
    const chapters = [row('a', 'done', { updated: '2026-03-01' }), row('b', 'running', { updated: '2026-03-05' })]
    const [parent] = buildRows(chapters, [book('x', ['a', 'b'])], new Set(), all, false)
    expect(parent).toMatchObject({ kind: 'book', status: 'running', verified: 1, updated: '2026-03-05', expanded: false })
  })

  it('applies the status, type and search filters to books', () => {
    const books = [book('x', ['a', 'b'])]
    expect(ids(buildRows(jobs, books, new Set(), { ...all, status: 'done' }, false))).toContain('book:x')
    expect(ids(buildRows(jobs, books, new Set(), { ...all, status: 'running' }, false))).not.toContain('book:x')
    expect(ids(buildRows(jobs, books, new Set(), { ...all, type: 'course-sync' }, false))).not.toContain('book:x')
    expect(ids(buildRows(jobs, books, new Set(), { ...all, query: ' BOOK X ' }, false))).toContain('book:x')
    expect(ids(buildRows(jobs, books, new Set(), { ...all, query: 'nope' }, false))).not.toContain('book:x')
  })

  it('does not show chapters of a filtered-out book as single jobs', () => {
    const rows = buildRows(jobs, [book('x', ['a'])], new Set(), { ...all, query: 'b.pdf' }, false)
    expect(ids(rows)).toEqual(['job:make-accessible:b'])
  })

  it('opens every book in read-only mode', () => {
    const rows = buildRows(jobs, [book('x', ['a', 'b'])], new Set(), all, true)
    expect(rows[0]).toMatchObject({ kind: 'book', readOnly: true, expanded: true })
    expect(ids(rows).slice(0, 3)).toEqual(['book:x', 'chapter:a', 'chapter:b'])
  })
})
