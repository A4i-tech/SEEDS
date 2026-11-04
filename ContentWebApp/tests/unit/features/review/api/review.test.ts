import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_TIMEOUT_MS, apiClient } from '@shared/services/apiClient'
import { approveReview } from '@features/review/api/review'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { post: vi.fn() },
}))

describe('review api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('approveReview verifies with the long timeout', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: '' })
    await approveReview('job 1', 'T')
    expect(apiClient.post).toHaveBeenCalledWith(
      '/textbook-remediation/jobs/job%201/verify',
      { title: 'T' },
      { timeoutMs: LONG_TIMEOUT_MS },
    )
  })
})
