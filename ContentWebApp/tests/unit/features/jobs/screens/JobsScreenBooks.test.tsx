import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { deleteBook, downloadBookArtifact, reorderBook } from '@features/jobs/api/books'
import { deleteRemediationJob, getRemediationJobsAndBooks } from '@features/jobs/api/remediationJobs'
import { getActiveSyncJobs, getSyncJobs } from '@features/jobs/api/syncJobs'
import { getVolunteers } from '@features/registration/api/volunteers'
import type { Book, RemediationJob } from '@features/jobs/types/job.types'
import { JobsScreen } from '@features/jobs/screens/JobsScreen'
import i18n from '@shared/i18n'
import { ApiError } from '@shared/services/apiClient'
import { volunteerRole } from '@shared/utils/jwt'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@features/registration/api/volunteers', () => ({ getVolunteers: vi.fn() }))
vi.mock('@features/jobs/api/remediationJobs', () => ({
  assignRemediationJob: vi.fn(),
  deleteRemediationJob: vi.fn(),
  downloadRemediationArtifact: vi.fn(),
  getRemediationJobsAndBooks: vi.fn(),
}))
vi.mock('@features/jobs/api/books', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/jobs/api/books')>()),
  reorderBook: vi.fn(),
  deleteBook: vi.fn(),
  downloadBookArtifact: vi.fn(),
}))
vi.mock('@features/jobs/api/syncJobs', () => ({ getSyncJobs: vi.fn(), getActiveSyncJobs: vi.fn() }))
vi.mock('@shared/components/BookOrganiser', () => ({
  BookOrganiser: ({
    items,
    onChange,
  }: {
    items: { id: string; name: string }[]
    onChange: (items: { id: string; name: string }[]) => void
  }) => (
    <ul>
      {items.map((item, index) => (
        <li key={item.id}>
          {item.name}
          <button
            type="button"
            onClick={() => {
              const next = [...items]
              ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
              onChange(next)
            }}
          >
            Move {item.name} down
          </button>
        </li>
      ))}
    </ul>
  ),
}))

const job = (id: string, over: Partial<RemediationJob> = {}): RemediationJob => ({
  job_id: id,
  source_name: `${id}.pdf`,
  status: 'verified',
  draft_remediated_md: '',
  error: '',
  translation_error: '',
  artifacts: {},
  stage_index: 3,
  stage_count: 3,
  progress: { message: '', percent: 0 },
  source_page_count: 0,
  models: { ocr: '', verify: '', block_tree: '', alt_text: '', translation: '' },
  metrics: { processed_pages: 0, diagrams_described: 0, tables_fixed: 0, flagged_items_count: 0 },
  created_at: '2026-01-02',
  finished_at: '',
  assigned_to: '',
  book_id: null,
  edit_accuracy: null,
  ...over,
})

const book = (over: Partial<Book> = {}): Book => ({
  book_id: 'book-1',
  title: 'Atlas',
  language: 'en',
  job_ids: ['j2', 'j1', 'j3'],
  created_at: '2026-02-01',
  edit_accuracy: null,
  ...over,
})

const chapters = (over: Partial<RemediationJob> = {}) =>
  ['j1', 'j2', 'j3'].map((id) => job(id, { book_id: 'book-1', ...over }))

const toggle = () => screen.getByRole('button', { name: 'Chapters of Atlas' })
const rowTexts = () => screen.getAllByRole('row').map((row) => row.textContent ?? '')

function load(jobs: RemediationJob[], books: Book[]) {
  vi.mocked(getRemediationJobsAndBooks).mockResolvedValue({ jobs, books })
}

describe('JobsScreen books', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(getActiveSyncJobs).mockResolvedValue([])
    vi.mocked(getVolunteers).mockResolvedValue([])
    load([...chapters(), job('s1', { source_name: 'single.pdf' })], [book()])
  })

  it('disables all downloads until every chapter is verified and links them to the hint', async () => {
    load(chapters().map((c, i) => (i === 0 ? { ...c, status: 'ready_to_review' as const } : c)), [book()])
    renderWithProviders(<JobsScreen />)
    const hint = await screen.findByText('Available when all 3 chapters are verified')
    for (const name of ['Word', 'PDF', 'LaTeX']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-describedby', hint.id)
    }
    expect(screen.getByText('2 of 3 verified')).toBeInTheDocument()
  })

  it('downloads each format of a fully verified book', async () => {
    vi.mocked(downloadBookArtifact).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    for (const [name, format] of [['Word', 'docx'], ['PDF', 'pdf'], ['LaTeX', 'tex']] as const) {
      fireEvent.click(screen.getByRole('button', { name }))
      await waitFor(() => expect(downloadBookArtifact).toHaveBeenCalledWith('book-1', format, `Atlas.${format}`))
    }
  })

  it('shows books first, chapters in book order under their book, then single jobs', async () => {
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('j1.pdf')).toBeNull()

    fireEvent.click(toggle())
    const rows = rowTexts()
    expect(rows).toHaveLength(6)
    expect(rows[1]).toContain('Atlas')
    expect(rows[2]).toContain('Chapter 1j2.pdf')
    expect(rows[3]).toContain('Chapter 2j1.pdf')
    expect(rows[4]).toContain('Chapter 3j3.pdf')
    expect(rows[5]).toContain('single.pdf')
  })

  it('collapses again and keeps the expanded state across a data refresh', async () => {
    vi.mocked(deleteRemediationJob).mockResolvedValue(undefined)
    vi.mocked(getRemediationJobsAndBooks)
      .mockResolvedValueOnce({ jobs: [...chapters(), job('s1', { source_name: 'single.pdf' })], books: [book()] })
      .mockResolvedValue({ jobs: chapters({ status: 'running' }), books: [book()] })
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle())
    expect(screen.queryByText('j1.pdf')).toBeNull()
    fireEvent.click(toggle())

    fireEvent.click(within(screen.getByRole('row', { name: /single\.pdf/ })).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete job' }))
    await waitFor(() => expect(getRemediationJobsAndBooks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('single.pdf')).toBeNull())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('j1.pdf')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Atlas/ })).getByText('Running')).toBeInTheDocument()
  })

  it('skips a chapter id that is not loaded', async () => {
    load(chapters(), [book({ job_ids: ['j1', 'ghost', 'j2', 'j3'] })])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(screen.getByText('3 chapters')).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(rowTexts()).toHaveLength(5)
  })

  it('saves the new chapter order and closes the modal on success', async () => {
    vi.mocked(reorderBook).mockResolvedValue(book())
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reorder chapters of "Atlas"' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move j2.pdf down' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save order' }))
    await waitFor(() => expect(reorderBook).toHaveBeenCalledWith('book-1', ['j1', 'j2', 'j3']))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the modal open and shows the server message when saving fails', async () => {
    vi.mocked(reorderBook).mockRejectedValue(new Error('Order was rejected'))
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save order' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Order was rejected')
    expect(within(dialog).queryByRole('button', { name: 'Reload' })).toBeNull()
  })

  it('offers Reload on a 422 and refetches the jobs', async () => {
    vi.mocked(reorderBook).mockRejectedValue(new ApiError(422, 'Chapters changed'))
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save order' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Chapters changed')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(getRemediationJobsAndBooks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('asks before deleting a book', async () => {
    vi.mocked(deleteBook).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(within(screen.getByRole('row', { name: /Atlas/ })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Delete the book "Atlas" and its 3 chapters? This cannot be undone.')).toBeInTheDocument()
    expect(deleteBook).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete book' }))
    await waitFor(() => expect(vi.mocked(deleteBook).mock.calls[0]?.[0]).toBe('book-1'))
    await waitFor(() => expect(getRemediationJobsAndBooks).toHaveBeenCalledTimes(2))
  })

  it('keeps the remaining row visible when a filter leaves fewer rows than the current page', async () => {
    load(Array.from({ length: 11 }, (_, i) => job(`p${String(i).padStart(2, '0')}`)), [])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('p00.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByText('p00.pdf')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('jobs.search') }), { target: { value: 'p05' } })

    expect(await screen.findByText('p05.pdf')).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('jobs.empty'))).toBeNull()
  })

  it('deletes one chapter without deleting the book', async () => {
    vi.mocked(deleteRemediationJob).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    fireEvent.click(toggle())
    fireEvent.click(within(screen.getByRole('row', { name: /j1\.pdf/ })).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete job' }))
    await waitFor(() => expect(vi.mocked(deleteRemediationJob).mock.calls[0]?.[0]).toBe('j1'))
    expect(deleteBook).not.toHaveBeenCalled()
  })

  it('shows a volunteer a read-only heading with the chapters and no parent actions', async () => {
    useAuthStore.setState({ role: volunteerRole })
    renderWithProviders(<JobsScreen />)
    expect(await screen.findByText('Book: Atlas')).toBeInTheDocument()
    expect(screen.getByText('j1.pdf')).toBeInTheDocument()
    expect(screen.getByText('j3.pdf')).toBeInTheDocument()
    for (const name of ['Chapters of Atlas', 'Word', 'PDF', 'LaTeX', 'Reorder', 'Delete', 'Assign']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByText(/Available when all/)).toBeNull()
  })

  it.each([
    ['running', ['verified', 'running'], 'Running'],
    ['verified', ['verified', 'verified'], 'Done'],
    ['in review', ['verified', 'in_review'], 'Needs review'],
  ] as const)('derives the %s book status', async (_label, statuses, badge) => {
    const jobs = statuses.map((status, i) => job(`k${i}`, { book_id: 'book-1', status }))
    load(jobs, [book({ job_ids: ['k0', 'k1'] })])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(within(screen.getByRole('row', { name: /Atlas/ })).getByText(badge)).toBeInTheDocument()
  })
})

describe('JobsScreen accuracy column', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(getActiveSyncJobs).mockResolvedValue([])
    vi.mocked(getVolunteers).mockResolvedValue([])
  })

  const rowOf = (name: RegExp) => within(screen.getByRole('row', { name }))

  it('shows one decimal for a verified job and a dash for an unverified one', async () => {
    load([job('s1', { edit_accuracy: 93.3 }), job('s2', { status: 'running' })], [])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('s1.pdf')
    expect(rowOf(/s1\.pdf/).getByText('93.3%')).toBeInTheDocument()
    expect(rowOf(/s2\.pdf/).getByText('—')).toBeInTheDocument()
  })

  it('shows the book value with "so far" while chapters are unverified, and on chapter rows', async () => {
    const jobs = ['j1', 'j2', 'j3', 'j4'].map((id, i) =>
      job(id, { book_id: 'book-1', status: i < 2 ? 'verified' : 'ready_to_review', edit_accuracy: i < 2 ? 90 : null }),
    )
    load(jobs, [book({ job_ids: ['j1', 'j2', 'j3', 'j4'], edit_accuracy: 93.3 })])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(rowOf(/Atlas/).getByText('93.3% so far')).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(rowOf(/j1\.pdf/).getByText('90.0%')).toBeInTheDocument()
    expect(rowOf(/j3\.pdf/).getByText('—')).toBeInTheDocument()
  })

  it('omits "so far" when every chapter is verified', async () => {
    load(chapters({ edit_accuracy: 80 }), [book({ edit_accuracy: 80 })])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(rowOf(/Atlas/).getByText('80.0%')).toBeInTheDocument()
    expect(screen.queryByText(/so far/)).toBeNull()
  })

  it('links the header to its help text', async () => {
    load(chapters(), [book()])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Atlas')
    expect(screen.getByRole('columnheader', { name: /Accuracy/ })).toHaveAccessibleDescription(
      'Share of the machine text the reviewer left unchanged. 100% means no edits. 0% means everything was changed.',
    )
  })

  it('hides the column from a volunteer', async () => {
    useAuthStore.setState({ role: volunteerRole })
    load(chapters({ edit_accuracy: 80 }), [book({ edit_accuracy: 80 })])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('Book: Atlas')
    expect(screen.queryByRole('columnheader', { name: /Accuracy/ })).toBeNull()
    expect(screen.queryByText(/80\.0%/)).toBeNull()
  })
})
