import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@features/auth/store/useAuthStore'
import { useSyncJob } from '@features/jobs/hooks/useSyncJob'
import { getSyncStatus } from '@features/jobs/api/syncJobs'
import type { SyncJob } from '@features/jobs/types/job.types'
import { streamJob } from '@shared/services/sse'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

vi.mock('@shared/services/sse', () => ({ streamJob: vi.fn() }))
vi.mock('@features/jobs/api/syncJobs', () => ({
  getSyncStatus: vi.fn(),
  syncJobStreamUrl: (jobId: string) => `/stream/${jobId}`,
}))

const syncJob = (overrides: Partial<SyncJob> = {}): SyncJob => ({
  job_id: 'sync-1',
  scope: 'all',
  course_id: '',
  status: 'running',
  started_at: '2026-01-01',
  finished_at: '',
  total_courses: 0,
  processed: 0,
  stats: { saved: 0, skipped: 0, empty: 0, failed: 0 },
  error: '',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated' })
  vi.mocked(streamJob).mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSyncJob', () => {
  it('refetches quickly while the total is still 0', async () => {
    vi.mocked(getSyncStatus)
      .mockResolvedValueOnce(syncJob({ total_courses: 0 }))
      .mockResolvedValue(syncJob({ total_courses: 5 }))
    const { result } = renderHookWithProviders(() => useSyncJob('sync-1', true))
    await waitFor(() => expect(result.current.data?.total_courses).toBe(5), { timeout: 3000 })
  })

  it('does not refetch a completed job with no courses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(getSyncStatus).mockResolvedValue(syncJob({ status: 'completed', total_courses: 0 }))
    const { result } = renderHookWithProviders(() => useSyncJob('sync-1', true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await vi.advanceTimersByTimeAsync(3000)
    expect(getSyncStatus).toHaveBeenCalledTimes(1)
  })
})
