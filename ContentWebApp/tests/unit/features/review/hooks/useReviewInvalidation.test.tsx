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
  saveReviewDraft,
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
  translation_error: '',
  artifacts: {},
  language: 'auto',
  detected_language: '',
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

let remediateApprove!: (draft?: string | null) => Promise<void>
function RemediateHookRunner() {
  const { approve } = useReviewRemediate('job-1')
  remediateApprove = (draft = null) => approve.mutateAsync({ title: 'title', draft })
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

  it('remediate approve saves a dirty draft before verifying', async () => {
    const order: string[] = []
    vi.mocked(saveReviewDraft).mockImplementation(async () => {
      order.push('save')
    })
    vi.mocked(approveReview).mockImplementation(async () => {
      order.push('approve')
    })
    renderWithProviders(<RemediateHookRunner />)
    await remediateApprove('edited')
    expect(saveReviewDraft).toHaveBeenCalledWith('job-1', 'edited')
    expect(order).toEqual(['save', 'approve'])
  })

  it('remediate approve skips the save when nothing changed', async () => {
    renderWithProviders(<RemediateHookRunner />)
    await remediateApprove(null)
    expect(saveReviewDraft).not.toHaveBeenCalled()
    expect(approveReview).toHaveBeenCalledTimes(1)
  })

  it('remediate approve does not verify when the draft save fails', async () => {
    vi.mocked(saveReviewDraft).mockRejectedValue(new Error('save failed'))
    renderWithProviders(<RemediateHookRunner />)
    await expect(remediateApprove('edited')).rejects.toThrow('save failed')
    expect(approveReview).not.toHaveBeenCalled()
  })
})
