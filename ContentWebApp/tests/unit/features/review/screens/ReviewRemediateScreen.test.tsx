import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getArtifactMarkdown, getReviewJob, getReviewSummary } from '@features/review/api/review'
import { ReviewRemediateScreen } from '@features/review/screens/ReviewRemediateScreen'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ jobId: 'job-1' }),
  useNavigate: () => vi.fn(),
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
  created_at: '2026-01-01',
  finished_at: '',
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
})
