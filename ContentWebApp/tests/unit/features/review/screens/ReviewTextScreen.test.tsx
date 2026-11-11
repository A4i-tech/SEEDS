import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getArtifactMarkdown, getReviewJob } from '@features/review/api/review'
import { ReviewTextScreen } from '@features/review/screens/ReviewTextScreen'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ jobId: 'job-1' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@features/review/api/review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/review/api/review')>()),
  getArtifactMarkdown: vi.fn(),
  getReviewJob: vi.fn(),
}))

describe('ReviewTextScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'fonts', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    })
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getArtifactMarkdown).mockResolvedValue('before <image src="x.png"> after')
    vi.mocked(getReviewJob).mockResolvedValue({
      job_id: 'job-1',
      source_name: 'book.pdf',
      status: 'ready_to_review',
      draft_remediated_md: '',
      error: '',
      created_at: '2026-01-01',
      finished_at: '',
    })
  })

  it('shows the source name in the breadcrumb and never the job id', async () => {
    renderWithProviders(<ReviewTextScreen />)
    expect(await screen.findByText('book.pdf')).toBeTruthy()
    expect(screen.queryByText('job-1')).toBeNull()
  })

  it('renders the diff as plain text', async () => {
    renderWithProviders(<ReviewTextScreen />)
    await screen.findByText('book.pdf')
    expect(screen.getAllByRole('document')[0].textContent).not.toContain('<image')
  })

  it('draws the diff marks in the read-only source pane', async () => {
    renderWithProviders(<ReviewTextScreen />)
    await screen.findByText('book.pdf')
    expect(screen.getByLabelText('Source (original, read-only)')).toBeTruthy()
    expect(screen.queryByLabelText('Changes vs source')).toBeNull()
  })

  it('labels the draft button Save draft and offers the formatting toolbar', async () => {
    renderWithProviders(<ReviewTextScreen />)
    await screen.findByText('book.pdf')
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Bold' })).toBeTruthy()
  })
})
