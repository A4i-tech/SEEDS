import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import type { ContentItem } from '@features/library/types/content.types'
import type { Course } from '@features/library/api/library'
import { useLibrary } from '@features/library/hooks/useLibrary'
import { LibraryScreen } from '@features/library/screens/LibraryScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@features/library/hooks/useLibrary')

const mockedLibrary = vi.mocked(useLibrary)

function item(overrides: Record<string, unknown>): ContentItem {
  return {
    id: 'c1',
    language: 'hi',
    title: { english: 'River Song', local: '' },
    theme: { english: 'Nature', local: '' },
    is_pull_model: false,
    is_teacher_app: false,
    is_deleted: false,
    description: '',
    created_by: '',
    tenant_id: '',
    school_id: '',
    creation_time: 0,
    type: 'story',
    audio_content: [],
    is_processed: false,
    primary_audio_url: '',
    version: '',
    job_id: '',
    ...overrides,
  } as ContentItem
}

const course: Course = {
  id: 'course-1',
  name: 'G1 Math',
  org: 'Org',
  number: 'G1',
  language: 'en',
  synced: false,
}

function renderLibrary() {
  mockedLibrary.mockReturnValue({
    state: { status: 'done' },
    content: [
      item({}),
      item({
        id: 'c2',
        type: 'quiz',
        language: 'en',
        title: { english: 'Math Quiz', local: '' },
        theme: { english: 'Numbers', local: '' },
      }),
    ],
    courses: [course],
    reload: vi.fn(),
    removeContent: vi.fn(),
    removeCourse: vi.fn(),
    syncAll: vi.fn(),
    syncingAll: false,
    refreshIvr: vi.fn(),
  } as unknown as ReturnType<typeof useLibrary>)
  renderWithProviders(<LibraryScreen />)
}

describe('LibraryScreen filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  })

  it('search narrows rows by title', () => {
    renderLibrary()
    expect(screen.getByText('River Song')).toBeInTheDocument()
    expect(screen.getByText('Math Quiz')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by title, language, or experience…' }), {
      target: { value: 'river' },
    })
    expect(screen.getByText('River Song')).toBeInTheDocument()
    expect(screen.queryByText('Math Quiz')).not.toBeInTheDocument()
    expect(screen.queryByText('G1 Math')).not.toBeInTheDocument()
  })

  it('experience chips narrow rows by kind', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quiz' }))
    expect(screen.getByText('Math Quiz')).toBeInTheDocument()
    expect(screen.queryByText('River Song')).not.toBeInTheDocument()
    expect(screen.queryByText('G1 Math')).not.toBeInTheDocument()
  })

  it('All chip resets the kind filter', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quiz' }))
    expect(screen.queryByText('River Song')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('River Song')).toBeInTheDocument()
    expect(screen.getByText('Math Quiz')).toBeInTheDocument()
    expect(screen.getByText('G1 Math')).toBeInTheDocument()
  })
})
