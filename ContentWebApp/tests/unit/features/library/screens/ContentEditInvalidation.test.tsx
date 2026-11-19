import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getContentById, updateContent } from '@features/library/api/library'
import { libraryKeys } from '@features/library/types/content.types'
import { ContentEditScreen } from '@features/library/screens/ContentEditScreen'
import { getLanguages } from '@shared/services/languages'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ kind: 'story', id: 'c1' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@features/library/api/library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/library/api/library')>()),
  getContentById: vi.fn(),
  updateContent: vi.fn(),
}))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))

const item = {
  id: 'c1',
  type: 'story',
  title: { english: 'T', local: 'L' },
  theme: { english: 'T', local: 'L' },
  description: 'd',
  language: 'en',
  is_pull_model: false,
  is_teacher_app: false,
  is_processed: true,
}

function ListProbe({ onFetch }: { onFetch: () => void }) {
  useQuery({
    queryKey: libraryKeys.content,
    queryFn: async () => {
      onFetch()
      return []
    },
    enabled: true,
  })
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  vi.mocked(getContentById).mockResolvedValue(item)
  vi.mocked(updateContent).mockResolvedValue(item)
  vi.mocked(getLanguages).mockResolvedValue([])
})

describe('content edit invalidates the library list', () => {
  it('refetches the list after save', async () => {
    const onFetch = vi.fn()
    renderWithProviders(
      <>
        <ListProbe onFetch={onFetch} />
        <ContentEditScreen />
      </>,
    )
    await waitFor(() => expect(onFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onFetch).toHaveBeenCalledTimes(2))
  })
})
