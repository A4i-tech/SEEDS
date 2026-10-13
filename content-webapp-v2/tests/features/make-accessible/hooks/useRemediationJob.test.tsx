import { act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@features/auth/store/useAuthStore'
import { useRemediationJob } from '../../../../src/features/make-accessible/hooks/useRemediationJob'
import { getRemediationJob } from '@features/make-accessible/api/remediation'
import { streamJob } from '@shared/services/sse'
import type { RemediationJobDetail } from '@features/make-accessible/types/remediation.types'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

vi.mock('@shared/services/sse', () => ({ streamJob: vi.fn() }))
vi.mock('@features/make-accessible/api/remediation', () => ({
  getRemediationJob: vi.fn(),
  remediationJobStreamUrl: (jobId: string) => `/stream/${jobId}`,
}))

const job = (overrides: Partial<RemediationJobDetail> = {}): RemediationJobDetail => ({
  job_id: 'job-1',
  source_name: 'book.pdf',
  language: 'kn',
  detected_language: '',
  status: 'running',
  stage: 'ocr',
  stage_index: 1,
  stage_count: 3,
  artifacts: {},
  counts: {},
  progress: { message: '', percent: undefined },
  draft_remediated_md: '',
  verified_at: '',
  verified_by: '',
  title: '',
  target_language: '',
  translation_error: '',
  error: '',
  created_at: '2026-01-01',
  finished_at: '',
  metrics: {
    total_pages: undefined,
    processed_pages: undefined,
    diagrams_described: undefined,
    tables_fixed: undefined,
    flagged_items_count: undefined,
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated' })
  vi.mocked(streamJob).mockReturnValue(new Promise(() => {}))
  vi.mocked(getRemediationJob).mockResolvedValue(job())
})

describe('useRemediationJob', () => {
  it('follows a running job', async () => {
    const { result } = renderHookWithProviders(() => useRemediationJob('job-1'))
    await waitFor(() => expect(result.current.data?.status).toBe('running'))
    expect(streamJob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(streamJob).mock.calls[0][0]).toContain('/stream/job-1')
  })

  it('follows a pending job, which has not reached a stage yet', async () => {
    vi.mocked(getRemediationJob).mockResolvedValue(job({ status: 'pending', stage: '', stage_index: 0 }))
    const { result } = renderHookWithProviders(() => useRemediationJob('job-1'))
    await waitFor(() => expect(result.current.data?.status).toBe('pending'))
    expect(streamJob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(streamJob).mock.calls[0][0]).toContain('/stream/job-1')
  })

  it('opens a stream even for a terminal job (v2 always streams; no polling either)', async () => {
    vi.mocked(getRemediationJob).mockResolvedValue(job({ status: 'ready_to_review' }))
    const { result } = renderHookWithProviders(() => useRemediationJob('job-1'))
    await waitFor(() => expect(result.current.data?.status).toBe('ready_to_review'))
    expect(streamJob).toHaveBeenCalledTimes(1)
  })

  it('a stream event replaces the job instead of appending a duplicate', async () => {
    let emit: (value: RemediationJobDetail) => void = () => {}
    vi.mocked(streamJob).mockImplementation((_url, _headers, _schema, onJob) => {
      emit = onJob as typeof emit
      return new Promise(() => {})
    })
    const { result } = renderHookWithProviders(() => useRemediationJob('job-1'))
    await waitFor(() => expect(result.current.data?.stage).toBe('ocr'))

    act(() => emit(job({ stage: 'review', stage_index: 2 })))

    await waitFor(() => expect(result.current.data?.stage).toBe('review'))
    expect(result.current.data?.stage_index).toBe(2)
  })

  it('aborts the stream on unmount', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(streamJob).mockImplementation((_url, _headers, _schema, _onJob, sig) => {
      signal = sig
      return new Promise(() => {})
    })
    const { result, unmount } = renderHookWithProviders(() => useRemediationJob('job-1'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})

