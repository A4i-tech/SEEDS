import { useQuery } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getRemediationJobs } from '@features/jobs/api/remediationJobs'
import {
  approveReview,
  getArtifactMarkdown,
  getReviewJob,
  getReviewSummary,
  reviewKeys,
} from '@features/review/api/review'
import { useReviewText } from '@features/review/hooks/useReviewText'
import { useReviewRemediate } from '@features/review/hooks/useReviewRemediate'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@features/jobs/api/remediationJobs', () => ({ getRemediationJobs: vi.fn() }))
vi.mock('@features/review/api/review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/review/api/review')>()),
  getArtifactMarkdown: vi.fn(),
  getReviewJob: vi.fn(),
  getReviewSummary: vi.fn(),
  saveReviewDraft: vi.fn(),
  approveReview: vi.fn(),
}))

const job = {
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'ready_to_review' as const,
  draft_remediated_md: '',
  error: '',
  created_at: '2026-01-02',
  finished_at: '',
}

function QueueProbe() {
  useQuery({ queryKey: reviewKeys.queue, queryFn: () => getRemediationJobs(200), enabled: true })
  return null
}

let textApprove!: () => Promise<void>
function TextHookRunner() {
  const { approve } = useReviewText('job-1')
  textApprove = () => approve.mutateAsync()
  return null
}

let remediateApprove!: () => Promise<void>
function RemediateHookRunner() {
  const { approve } = useReviewRemediate('job-1')
  remediateApprove = () => approve.mutateAsync('title')
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  vi.mocked(getRemediationJobs).mockResolvedValue([job])
  vi.mocked(getArtifactMarkdown).mockResolvedValue('page one')
  vi.mocked(getReviewJob).mockResolvedValue(job)
  vi.mocked(getReviewSummary).mockResolvedValue({
    job_id: 'job-1',
    status: 'ready_to_review',
    total_pages: 1,
    diagrams_described_count: 0,
    tables_fixed_count: 0,
    flagged_items_count: 0,
    diagrams: [],
    tables: [],
    flagged_items: [],
  })
  vi.mocked(approveReview).mockResolvedValue(undefined)
})

describe('review approve invalidates the queue', () => {
  it('text review refetches the queue after approve', async () => {
    renderWithProviders(
      <>
        <QueueProbe />
        <TextHookRunner />
      </>,
    )
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledTimes(1))
    await textApprove()
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledTimes(2))
  })

  it('remediate review refetches the queue after approve', async () => {
    renderWithProviders(
      <>
        <QueueProbe />
        <RemediateHookRunner />
      </>,
    )
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledTimes(1))
    await remediateApprove()
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledTimes(2))
  })
})
