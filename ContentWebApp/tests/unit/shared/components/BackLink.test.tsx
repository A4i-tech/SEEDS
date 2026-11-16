import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { BackLink } from '@shared/components/BackLink'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

describe('BackLink', () => {
  it('renders a link to the target with the label', () => {
    renderWithProviders(<BackLink to="/create" label="Create" />)
    expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/create')
  })
})
