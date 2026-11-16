import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { AppBreadcrumbs } from '@shared/components/AppBreadcrumbs'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

describe('AppBreadcrumbs', () => {
  it('renders a named nav landmark with a linked parent and a current last crumb', () => {
    renderWithProviders(<AppBreadcrumbs crumbs={[{ label: 'Library', to: '/library' }, { label: 'Course' }]} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.queryByRole('link', { name: 'Course' })).not.toBeInTheDocument()
    expect(screen.getByText('Course')).toHaveAttribute('aria-current', 'page')
  })
})
