import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { renderWithProviders } from '../../test-utils/renderWithProviders'
import { useMe } from '@features/account/hooks/useAccount'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import type { Role } from '@shared/utils/jwt'
import { Shell } from '@app/navigation/Shell'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useLocation: () => ({ pathname: '/home' }),
  useMatchRoute: () => () => false,
  useNavigate: () => vi.fn(),
}))

vi.mock('@features/account/hooks/useAccount', () => ({
  useMe: vi.fn(() => ({ isSuccess: false })),
}))

describe('Shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', role: 'tenant', schoolId: '' })
  })

  it.each([
    ['tenant', ['Library', 'Jobs', 'Create', 'Make accessible', 'Review', 'Analytics', 'Registration', 'Localize']],
    ['school_admin', ['Library', 'Jobs', 'Create', 'Make accessible', 'Review', 'Analytics', 'Registration']],
    ['content_creator', ['Library', 'Jobs', 'Create', 'Make accessible', 'Review']],
  ])('shows the right nav links for %s', (role, visible) => {
    useAuthStore.setState({ status: 'authenticated', role: role as Role, schoolId: '' })
    renderWithProviders(<Shell />)
    const all = ['Library', 'Jobs', 'Create', 'Make accessible', 'Review', 'Analytics', 'Registration', 'Localize']
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    all.forEach((name) => {
      const link = screen.queryByRole('link', { name })
      if (visible.includes(name)) expect(link).toBeInTheDocument()
      else expect(link).not.toBeInTheDocument()
    })
  })

  it('offers a skip link to the main content', () => {
    renderWithProviders(<Shell />)
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')).toBeInTheDocument()
  })

  it('shows the initial in the account trigger and a red Sign out with no Theme item', async () => {
    vi.mocked(useMe).mockReturnValue({ isSuccess: true, data: { name: 'Asha Rao' } } as ReturnType<typeof useMe>)
    renderWithProviders(<Shell />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger).toHaveTextContent('A')
    fireEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toHaveStyle({ '--menu-item-color': 'var(--mantine-color-red-6)' })
    expect(screen.queryByRole('menuitem', { name: 'Theme' })).toBeNull()
  })

  it('still opens the menu and confirms sign out while the account is not loaded', async () => {
    vi.mocked(useMe).mockReturnValue({ isSuccess: false } as ReturnType<typeof useMe>)
    renderWithProviders(<Shell />)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

