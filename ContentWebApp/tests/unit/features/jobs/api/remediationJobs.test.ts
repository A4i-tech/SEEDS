import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@shared/services/apiClient'
import { deleteRemediationJob } from '@features/jobs/api/remediationJobs'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { delete: vi.fn() },
}))

describe('remediationJobs api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deleteRemediationJob calls DELETE on the encoded job path', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await deleteRemediationJob('job 1')
    expect(apiClient.delete).toHaveBeenCalledWith('/textbook-remediation/jobs/job%201')
  })
})
