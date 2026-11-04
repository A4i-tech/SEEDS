import { screen } from '@testing-library/react'
import { Anchor, Modal, Text } from '@mantine/core'
import { describe, expect, it } from 'vitest'

import { seedsTheme } from '@app/theme/seedsTheme'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

describe('seedsTheme', () => {
  it('labels the modal close button', () => {
    renderWithProviders(<Modal opened onClose={() => {}} title="T">x</Modal>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('defaults Text and Anchor to 16px', () => {
    renderWithProviders(<><Text>t</Text><Anchor>a</Anchor></>)
    expect(screen.getByText('t')).toHaveStyle('--text-fz: var(--mantine-font-size-sm)')
    expect(screen.getByText('a')).toHaveStyle('--text-fz: var(--mantine-font-size-sm)')
  })

  it.each(['rowTitle', 'label', 'rowAction'])('applies the %s text style', (variant) => {
    renderWithProviders(<><Text variant={variant}>t</Text><Anchor variant={variant}>a</Anchor></>)
    expect(screen.getByText('t')).toHaveAttribute('data-variant', variant)
    expect(screen.getByText('a')).toHaveAttribute('data-variant', variant)
    expect(screen.getByText('t').className).toMatch(/text/)
    expect(screen.getByText('a').className).toMatch(/anchor/)
  })

  it('carries the page title size on h1', () => {
    expect(seedsTheme.headings?.sizes?.h1?.fontSize).toBe('40px')
  })
})
