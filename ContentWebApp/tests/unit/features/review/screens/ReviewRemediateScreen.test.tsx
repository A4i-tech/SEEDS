import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getArtifactMarkdown, getReviewJob, getReviewSummary } from '@features/review/api/review'
import { useBlocker } from '@tanstack/react-router'
import { ReviewRemediateScreen } from '@features/review/screens/ReviewRemediateScreen'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ jobId: 'job-1' }),
  useNavigate: () => vi.fn(),
  useBlocker: vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@features/review/api/review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/review/api/review')>()),
  getArtifactMarkdown: vi.fn(),
  getReviewJob: vi.fn(),
  getReviewSummary: vi.fn(),
}))

const job = {
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'ready_to_review' as const,
  draft_remediated_md: '',
  error: '',
  translation_error: '',
  artifacts: {},
  language: 'auto',
  detected_language: '',
  stage_index: 3,
  stage_count: 3,
  progress: { message: '', percent: 0 },
  source_page_count: 0,
  models: { ocr: 'mistral-ocr', verify: '', block_tree: '', alt_text: '', translation: '' },
  metrics: { processed_pages: 4, diagrams_described: 0, tables_fixed: 0, flagged_items_count: 0 },
  created_at: '2026-01-01',
  finished_at: '',
  assigned_to: '',
  book_id: '',
  edit_accuracy: 0,
}

const summary = {
  job_id: 'job-1',
  status: 'ready_to_review',
  total_pages: 1,
  diagrams_described_count: 0,
  tables_fixed_count: 0,
  flagged_items_count: 0,
  diagrams: [],
  tables: [],
  flagged_items: [],
}

describe('ReviewRemediateScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    })
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getArtifactMarkdown).mockResolvedValue('text')
    vi.mocked(getReviewSummary).mockResolvedValue(summary)
  })

  it('does not show the job id while loading', () => {
    vi.mocked(getReviewJob).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<ReviewRemediateScreen />)
    expect(screen.queryByText('job-1')).toBeNull()
  })

  it('shows the source name once loaded', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByText('book.pdf')).toBeTruthy()
    expect(screen.queryByText('job-1')).toBeNull()
  })

  it('keeps run details collapsed until opened', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    const toggle = await screen.findByRole('button', { name: 'Run details' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('mistral-ocr')).toBeTruthy()
  })

  it('puts one Download menu and the publish actions in the header, with no Back to queue', async () => {
    vi.mocked(getReviewJob).mockResolvedValue({ ...job, artifacts: { docx: 'u', pdf: 'u', tex: 'u' } })
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByRole('button', { name: 'Download' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download Word' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to queue' })).toBeNull()
  })

  it('has no separate Diagrams or Findings panels', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    await screen.findByText('book.pdf')
    expect(screen.queryByText('Diagrams')).toBeNull()
    expect(screen.queryByText('Findings')).toBeNull()
  })

  it('offers the OCR text toggle beside the original scan', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByRole('button', { name: 'Show OCR text' })).toBeTruthy()
  })

  it('publishes through one Verify & publish action', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByRole('button', { name: 'Verify & publish' })).toBeTruthy()
  })

  it('does not ask to confirm leaving while nothing is edited', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    await screen.findByText('book.pdf')
    const options = vi.mocked(useBlocker).mock.calls.at(-1)![0] as { shouldBlockFn: () => boolean; enableBeforeUnload: () => boolean }
    expect(options.shouldBlockFn()).toBe(false)
    expect(options.enableBeforeUnload()).toBe(false)
  })

  it('scrolls the draft when the original scan is scrolled', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    renderWithProviders(<ReviewRemediateScreen />)
    await screen.findByText('book.pdf')
    const scan = await screen.findByRole('region', { name: 'Original scan' })
    const draft = screen.getByRole('region', { name: 'Draft' })
    Object.defineProperty(scan, 'scrollHeight', { value: 1500, configurable: true })
    Object.defineProperty(scan, 'clientHeight', { value: 500, configurable: true })
    Object.defineProperty(draft, 'scrollHeight', { value: 2500, configurable: true })
    Object.defineProperty(draft, 'clientHeight', { value: 500, configurable: true })
    scan.scrollTop = 500
    fireEvent.scroll(scan)
    expect(draft.scrollTop).toBe(1000)
  })
})

describe('ReviewRemediateScreen header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    })
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getArtifactMarkdown).mockResolvedValue('text')
    vi.mocked(getReviewSummary).mockResolvedValue(summary)
  })

  it('shows the language and the verified state', async () => {
    vi.mocked(getReviewJob).mockResolvedValue({ ...job, status: 'verified', language: 'Tamil', detected_language: '' })
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByText('Language: Tamil')).toBeTruthy()
    expect(screen.getByText('Verified and saved to Library')).toBeTruthy()
  })

  it('replaces Verify & publish with a disabled Published button once verified', async () => {
    vi.mocked(getReviewJob).mockResolvedValue({ ...job, status: 'verified' })
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByRole('button', { name: 'Published' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Verify & publish' })).toBeNull()
  })

  it('shows the flag text after the reason', async () => {
    vi.mocked(getReviewJob).mockResolvedValue(job)
    vi.mocked(getReviewSummary).mockResolvedValue({
      ...summary,
      flagged_items: [{ id: 'f1', page: 1, type: 'paragraph', text: 'cut off', reason: 'Incomplete text', needs_check: true }],
    })
    vi.mocked(getArtifactMarkdown).mockResolvedValue('<!-- page 1 -->\n\nBody')
    renderWithProviders(<ReviewRemediateScreen />)
    expect(await screen.findByText('Incomplete text: cut off')).toBeTruthy()
  })
})
