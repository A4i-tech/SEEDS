import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getContentById } from '@features/library/api/library'
import type { ContentItem } from '@features/library/types/content.types'
import { LibraryDetailScreen } from '@features/library/screens/LibraryDetailScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ kind: 'poem', id: 'p1' }),
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@features/library/api/library', () => ({
  getContentById: vi.fn(),
  deleteContent: vi.fn(),
  getContentSasUrl: vi.fn(),
}))

describe('LibraryDetailScreen', () => {
  it('renders metadata as stacked labelled rows', async () => {
    useAuthStore.setState({ status: 'authenticated', role: 'tenant', schoolId: '' })
    vi.mocked(getContentById).mockResolvedValue({
      id: 'p1',
      type: 'poem',
      language: 'hi',
      title: { english: 'River', local: '', audio_url: '' },
      theme: { english: 'Nature', local: '', audio_url: '' },
      description: '',
      is_processed: true,
      audio_content: [{ audio_url: '', description: '', duration_seconds: 0 }],
    } as ContentItem)
    renderWithProviders(<LibraryDetailScreen />)
    for (const [label, value] of [
      ['Experience', 'Poem'],
      ['Theme', 'Nature'],
      ['Language', 'hi'],
    ]) {
      const labelEl = await screen.findByText(label)
      const valueEl = screen.getByText(value)
      expect(labelEl).not.toBe(valueEl)
      expect(labelEl.parentElement).toBe(valueEl.parentElement)
    }
  })
})
