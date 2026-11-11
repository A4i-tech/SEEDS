import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { LoginScreen } from '@features/auth/screens/LoginScreen'

vi.mock('@tanstack/react-router', () => ({
  useLinkProps: () => ({ href: '/register' }),
  useRouter: () => ({ navigate: vi.fn() }),
  useSearch: () => ({ redirect: '' }),
}))

vi.mock('@features/auth/hooks/useLogin', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

describe('LoginScreen validation', () => {
  it('shows translated Required for empty fields', async () => {
    const { container } = renderWithProviders(<LoginScreen />)
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect((await screen.findAllByText('Required')).length).toBeGreaterThanOrEqual(2)
  })
})
