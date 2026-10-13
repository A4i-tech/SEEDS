import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test-utils/renderWithProviders'
import { useAnalyticsRole } from '@features/analytics/hooks/useAnalytics'
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

vi.mock('@features/analytics/hooks/useAnalytics', () => ({
  useAnalyticsRole: vi.fn(),
}))

describe('Shell', () => {
  it('shows the Localize nav link for a tenant user', () => {
    vi.mocked(useAnalyticsRole).mockReturnValue('tenant')
    renderWithProviders(<Shell />)
    expect(screen.getByRole('link', { name: 'Localize' })).toBeInTheDocument()
  })

  it('hides the Analytics nav link when the role is unknown', () => {
    vi.mocked(useAnalyticsRole).mockReturnValue(undefined)
    renderWithProviders(<Shell />)
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument()
    // Localize is ungated in v2 — it stays visible for every role.
    expect(screen.getByRole('link', { name: 'Localize' })).toBeInTheDocument()
  })
})

