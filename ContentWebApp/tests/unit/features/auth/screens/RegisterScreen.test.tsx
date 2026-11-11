import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { RegisterScreen } from '@features/auth/screens/RegisterScreen'

vi.mock('@tanstack/react-router', () => ({
  useLinkProps: () => ({ href: '/' }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ redirect: '' }),
}))

vi.mock('@features/auth/api/register', () => ({ registerTenant: vi.fn() }))

function submit(container: HTMLElement) {
  fireEvent.submit(container.querySelector('form') as HTMLFormElement)
}

describe('RegisterScreen validation', () => {
  it('shows translated Required for empty fields', async () => {
    const { container } = renderWithProviders(<RegisterScreen />)
    submit(container)
    expect((await screen.findAllByText('Required')).length).toBeGreaterThanOrEqual(2)
  })

  it('shows translated Invalid email', async () => {
    const { container } = renderWithProviders(<RegisterScreen />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'nope' } })
    submit(container)
    expect(await screen.findByText('Invalid email')).toBeInTheDocument()
  })

  it('shows translated mismatch error', async () => {
    const { container } = renderWithProviders(<RegisterScreen />)
    fireEvent.change(screen.getAllByLabelText(/Password/)[0], { target: { value: 'Abcdef1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'Different1!' } })
    submit(container)
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
  })
})
