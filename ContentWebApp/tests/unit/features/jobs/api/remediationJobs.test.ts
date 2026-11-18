import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@shared/services/apiClient'
import { deleteRemediationJob, getRemediationJobs, getRemediationJobsAndBooks } from '@features/jobs/api/remediationJobs'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { delete: vi.fn(), get: vi.fn() },
}))

const job = {
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'verified',
  draft_remediated_md: '',
  error: '',
  translation_error: '',
  artifacts: {},
  stage_index: 3,
  stage_count: 3,
  progress: { message: '', percent: 0 },
  source_page_count: 0,
  models: { ocr: '', verify: '', block_tree: '', alt_text: '', translation: '' },
  metrics: { processed_pages: 0, diagrams_described: 0, tables_fixed: 0, flagged_items_count: 0 },
  created_at: '2026-01-02',
  finished_at: '',
  assigned_to: '',
  book_id: 'book-1',
  edit_accuracy: 93.3,
}
const book = { book_id: 'book-1', title: 'Atlas', language: 'en', job_ids: ['job-1'], created_at: '2026-01-01', edit_accuracy: 93.3 }

describe('remediationJobs api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deleteRemediationJob calls DELETE on the encoded job path', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await deleteRemediationJob('job 1')
    expect(apiClient.delete).toHaveBeenCalledWith('/textbook-remediation/jobs/job%201')
  })

  it('parses jobs together with books', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [job], books: [book] } })
    const result = await getRemediationJobsAndBooks(200)
    expect(apiClient.get).toHaveBeenCalledWith('/textbook-remediation/jobs', { params: { limit: 200 } })
    expect(result.books).toEqual([book])
    expect(result.jobs[0]?.book_id).toBe('book-1')
  })

  it('getRemediationJobs returns only the jobs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [job], books: [book] } })
    expect(await getRemediationJobs(200)).toEqual([job])
  })

  it('rejects a job or a book without edit_accuracy', async () => {
    const { edit_accuracy: _job, ...bareJob } = job
    const { edit_accuracy: _book, ...bareBook } = book
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [bareJob], books: [book] } })
    await expect(getRemediationJobsAndBooks(200)).rejects.toThrow()
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [job], books: [bareBook] } })
    await expect(getRemediationJobsAndBooks(200)).rejects.toThrow()
  })

  it('rejects a malformed book', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [job], books: [{ ...book, job_ids: 'job-1' }] } })
    await expect(getRemediationJobsAndBooks(200)).rejects.toThrow()
  })

  it('rejects a response without books', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { jobs: [job] } })
    await expect(getRemediationJobsAndBooks(200)).rejects.toThrow()
  })
})
