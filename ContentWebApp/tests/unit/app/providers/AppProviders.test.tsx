import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '@app/providers/AppProviders'
import { seedsColors } from '@app/theme/seedsPalette'
import { seedsTheme } from '@app/theme/seedsTheme'

describe('AppProviders', () => {
  it('emits CSS variables from the TS palette', () => {
    render(
      <AppProviders>
        <div />
      </AppProviders>,
    )
    expect(document.documentElement.innerHTML).toMatch(/--seeds-text-primary:\s*#1a1d1e/i)
    expect(document.documentElement.innerHTML).toMatch(/--mantine-color-dimmed:\s*#5f6769/i)
  })

  it('uses the palette ramps, primary shades and autoContrast', () => {
    expect(seedsTheme.primaryShade).toEqual({ light: 6, dark: 4 })
    expect(seedsTheme.autoContrast).toBe(true)
    expect(seedsTheme.colors).toEqual(seedsColors)
  })
})
