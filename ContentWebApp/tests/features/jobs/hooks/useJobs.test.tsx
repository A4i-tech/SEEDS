import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@features/auth/store/useAuthStore'
import { useJobs } from '../../../../src/features/jobs/hooks/useJobs'
import { getRemediationJobs } from '@features/jobs/api/remediationJobs'
import { getActiveSyncJobs, getSyncJobs } from '@features/jobs/api/syncJobs'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

vi.mock('@features/jobs/api/remediationJobs', () => ({ getRemediationJobs: vi.fn() }))
vi.mock('@features/jobs/api/syncJobs', () => ({
  getSyncJobs: vi.fn(),
  getActiveSyncJobs: vi.fn(),
}))

const job = (overrides = {}) => ({
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'running' as const,
  draft_remediated_md: '',
  error: '',
  created_at: '2026-01-02',
  finished_at: '',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated' })
  vi.mocked(getSyncJobs).mockResolvedValue([])
  vi.mocked(getActiveSyncJobs).mockResolvedValue([])
})

describe('useJobs', () => {
  it('lists remediation jobs once loaded', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([
      job(),
      job({ job_id: 'job-2', status: 'ready_to_review', created_at: '2026-01-01' }),
    ])
    const { result } = renderHookWithProviders(() => useJobs())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('done'))
    if (result.current.status !== 'done') throw new Error('expected done')
    expect(result.current.data.map((row) => [row.id, row.status])).toEqual([
      ['job-1', 'running'],
      ['job-2', 'needs-review'],
    ])
  })

  it('surfaces a failed listing', async () => {
    vi.mocked(getRemediationJobs).mockRejectedValue(new Error('network down'))
    const { result } = renderHookWithProviders(() => useJobs())
    await waitFor(() => expect(result.current.status).toBe('error'))
    if (result.current.status !== 'error') throw new Error('expected error')
    expect(result.current.error.message).toBe('network down')
  })
})

