import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_TIMEOUT_MS, apiClient } from '@shared/services/apiClient'
import { createBook, createRemediationJob } from '@features/make-accessible/api/remediation'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { delete: vi.fn(), postForm: vi.fn() },
}))

describe('remediation api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createRemediationJob posts the form with the long timeout', async () => {
    vi.mocked(apiClient.postForm).mockResolvedValue({ job_id: 'job-1' })
    await createRemediationJob(new File(['x'], 'book.pdf'))
    expect(apiClient.postForm).toHaveBeenCalledWith('/textbook-remediation/jobs', expect.any(FormData), {
      timeoutMs: LONG_TIMEOUT_MS,
    })
  })

  it('createBook sends every file in order with title and languages and parses the ids', async () => {
    vi.mocked(apiClient.postForm).mockResolvedValue({ book_id: 'book-1', job_ids: ['j1', 'j2'] })
    const [first, second, third] = [new File(['1'], 'a.pdf'), new File(['2'], 'b.pdf'), new File(['3'], 'c.pdf')]

    const result = await createBook([third, first, second], 'Science', 'ta')

    expect(result).toEqual({ book_id: 'book-1', job_ids: ['j1', 'j2'] })
    const [path, body, options] = vi.mocked(apiClient.postForm).mock.calls[0]
    expect(path).toBe('/textbook-remediation/books')
    expect(options).toEqual({ timeoutMs: LONG_TIMEOUT_MS })
    const form = body as FormData
    expect(form.getAll('files').map((f) => (f as File).name)).toEqual(['c.pdf', 'a.pdf', 'b.pdf'])
    expect(form.get('title')).toBe('Science')
    expect(form.get('language')).toBe('auto')
    expect(form.get('target_language')).toBe('ta')
  })
})
