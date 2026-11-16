import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getContentPage, getCourses } from '@features/library/api/library'
import { useLibrary } from '@features/library/hooks/useLibrary'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

vi.mock('@features/library/api/library', () => ({
  getContentPage: vi.fn(),
  getCourses: vi.fn(),
  deleteContent: vi.fn(),
  deleteCourse: vi.fn(),
  syncAllCourses: vi.fn(),
  updateIvr: vi.fn(),
}))

const story = (id: string) => ({
  id,
  language: 'en',
  type: 'story' as const,
  title: { english: id, local: '', audio_url: '' },
  theme: { english: '', local: '', audio_url: '' },
  is_pull_model: false,
  is_teacher_app: false,
  is_deleted: false,
  description: '',
  created_by: '',
  tenant_id: '',
  school_id: '',
  creation_time: 0,
  audio_content: [],
  is_processed: true,
  primary_audio_url: '',
  version: '',
  job_id: '',
})

const course = (id: string) => ({
  id,
  name: id,
  org: '',
  number: '',
  language: '',
  hidden: false,
  synced: false,
  lastSyncedAt: '',
  lastRunId: '',
})

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
})

describe('useLibrary pagination', () => {
  it('follows next_cursor until it is null for content and courses', async () => {
    vi.mocked(getContentPage)
      .mockResolvedValueOnce({
        data: [story('c1')],
        pagination: { next_cursor: 'cur-1', limit: 50 },
      })
      .mockResolvedValueOnce({
        data: [story('c2')],
        pagination: { next_cursor: null, limit: 50 },
      })
    vi.mocked(getCourses)
      .mockResolvedValueOnce({ courses: [course('k1')], next_cursor: 'cur-k' })
      .mockResolvedValueOnce({ courses: [course('k2')], next_cursor: null })

    const { result } = renderHookWithProviders(() => useLibrary())

    await waitFor(() => expect(result.current.content.map((i) => i.id)).toEqual(['c1', 'c2']))
    await waitFor(() => expect(result.current.courses.map((c) => c.id)).toEqual(['k1', 'k2']))
    expect(getContentPage).toHaveBeenNthCalledWith(1, '', 50)
    expect(getContentPage).toHaveBeenNthCalledWith(2, 'cur-1', 50)
    expect(getCourses).toHaveBeenNthCalledWith(1, '', 50)
    expect(getCourses).toHaveBeenNthCalledWith(2, 'cur-k', 50)
    expect(getContentPage).toHaveBeenCalledTimes(2)
    expect(getCourses).toHaveBeenCalledTimes(2)
  })

  it('surfaces an error when a later page fails instead of looping', async () => {
    vi.mocked(getContentPage)
      .mockResolvedValueOnce({
        data: [story('c1')],
        pagination: { next_cursor: 'cur-1', limit: 50 },
      })
      .mockRejectedValueOnce(new Error('page 2 failed'))
    vi.mocked(getCourses).mockResolvedValue({ courses: [], next_cursor: null })

    const { result } = renderHookWithProviders(() => useLibrary())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(getContentPage).toHaveBeenCalledTimes(2)
  })
})
