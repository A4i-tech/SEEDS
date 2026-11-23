import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { CreateSourceScreen } from '@features/create/screens/CreateSourceScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

vi.mock('@shared/services/languages', () => ({
  getLanguages: vi.fn().mockResolvedValue([{ code: 'en', name: 'English' }]),
}))

describe('CreateSourceScreen validation', () => {
  it('shows translated Required on empty submit', async () => {
    const { container } = renderWithProviders(<CreateSourceScreen />)
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect((await screen.findAllByText('Required')).length).toBeGreaterThanOrEqual(1)
  })
})
