import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@shared/services/apiClient'
import { saveBlob } from '@shared/utils/saveBlob'
import { deleteBook, downloadBookArtifact, reorderBook } from '@features/jobs/api/books'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'http://test-api' }))
vi.mock('@shared/utils/saveBlob', () => ({ saveBlob: vi.fn() }))
vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() },
}))

const book = { book_id: 'book 1', title: 'Atlas', language: 'en', job_ids: ['b', 'a'], created_at: '2026-01-01' }

describe('books api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reorderBook puts the job ids in order and parses the book', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: book })
    const result = await reorderBook('book 1', ['b', 'a'])
    expect(apiClient.put).toHaveBeenCalledWith('/textbook-remediation/books/book%201/order', { job_ids: ['b', 'a'] })
    expect(result).toEqual(book)
  })

  it('reorderBook rejects a malformed book', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...book, job_ids: null } })
    await expect(reorderBook('book 1', ['a'])).rejects.toThrow()
  })

  it('deleteBook calls DELETE on the encoded book path', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await deleteBook('book 1')
    expect(apiClient.delete).toHaveBeenCalledWith('/textbook-remediation/books/book%201')
  })

  it('downloadBookArtifact fetches the format and saves it under the filename', async () => {
    const blob = new Blob(['x'])
    vi.mocked(apiClient.getBlob).mockResolvedValue(blob)
    await downloadBookArtifact('book 1', 'pdf', 'Atlas.pdf')
    expect(apiClient.getBlob).toHaveBeenCalledWith('/textbook-remediation/books/book%201/artifacts/pdf')
    expect(saveBlob).toHaveBeenCalledWith(blob, 'Atlas.pdf')
  })
})
