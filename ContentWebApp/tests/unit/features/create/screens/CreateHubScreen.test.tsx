import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { CreateHubScreen } from '@features/create/screens/CreateHubScreen'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

describe('CreateHubScreen', () => {
  it('renders the heading and experience shortcuts', () => {
    renderWithProviders(<CreateHubScreen />)
    expect(screen.getByRole('heading', { name: 'Create' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiz' })).toBeInTheDocument()
  })

  it('opens the quiz builder when the Quiz shortcut is selected', () => {
    renderWithProviders(<CreateHubScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/create/quiz' })
  })

  it('opens upload when the Audio shortcut is selected', () => {
    renderWithProviders(<CreateHubScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/create/upload' })
  })

  it('renders experience chips at 44px height', () => {
    renderWithProviders(<CreateHubScreen />)
    expect(screen.getByRole('button', { name: 'Quiz' })).toHaveStyle({ height: 'calc(2.75rem * var(--mantine-scale))' })
  })
})

