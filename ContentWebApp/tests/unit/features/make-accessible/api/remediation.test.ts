import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_TIMEOUT_MS, apiClient } from '@shared/services/apiClient'
import { createRemediationJob, deleteRemediationJob } from '@features/make-accessible/api/remediation'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { delete: vi.fn(), postForm: vi.fn() },
}))

describe('remediation api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deleteRemediationJob calls DELETE on the encoded job path', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await deleteRemediationJob('job 1')
    expect(apiClient.delete).toHaveBeenCalledWith('/textbook-remediation/jobs/job%201')
  })

  it('createRemediationJob posts the form with the long timeout', async () => {
    vi.mocked(apiClient.postForm).mockResolvedValue({ job_id: 'job-1' })
    await createRemediationJob(new File(['x'], 'book.pdf'))
    expect(apiClient.postForm).toHaveBeenCalledWith('/textbook-remediation/jobs', expect.any(FormData), {
      timeoutMs: LONG_TIMEOUT_MS,
    })
  })
})
