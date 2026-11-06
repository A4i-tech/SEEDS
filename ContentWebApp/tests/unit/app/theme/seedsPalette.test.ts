import { isLightColor } from '@mantine/core'
import { describe, expect, it } from 'vitest'

import { seedsColors, seedsCssVariables, seedsCssVariablesResolver } from '@app/theme/seedsPalette'
import { seedsTheme } from '@app/theme/seedsTheme'

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const surfaces = {
  light: { page: '#f4f6f7', surface: '#ffffff' },
  dark: { page: '#242424', surface: '#2e2e2e' },
}

const existingDarkOverrides = [
  '--seeds-bg-page',
  '--seeds-bg-surface',
  '--seeds-text-primary',
  '--seeds-text-secondary',
  '--seeds-border-default',
  '--seeds-card-border',
  '--seeds-table-border',
  '--seeds-table-header-bg',
  '--seeds-table-header-text',
  '--seeds-subnav-text-active',
  '--seeds-subnav-bg-active',
  '--seeds-btn-secondary-border',
  '--seeds-btn-secondary-text',
  '--seeds-btn-tertiary-text',
  '--seeds-eyebrow-text',
] as const

const textPairs = [
  ['--seeds-badge-easy-text', '--seeds-badge-easy-bg'],
  ['--seeds-badge-hard-text', '--seeds-badge-hard-bg'],
  ['--seeds-badge-neutral-text', '--seeds-badge-neutral-bg'],
  ['--seeds-badge-subject-text', '--seeds-badge-subject-bg'],
  ['--seeds-badge-warning-text', '--seeds-badge-warning-bg'],
  ['--seeds-btn-primary-text', '--seeds-btn-primary-bg'],
  ['--seeds-btn-destructive-text', '--seeds-btn-destructive-bg'],
  ['--seeds-nav-topbar-text', '--seeds-nav-topbar-bg'],
  ['--seeds-pagebtn-active-text', '--seeds-pagebtn-active-bg'],
  ['--seeds-subnav-text-active', '--seeds-subnav-bg-active'],
  ['--seeds-table-header-text', '--seeds-table-header-bg'],
] as const

const resolved = {
  light: seedsCssVariables.light,
  dark: {
    ...seedsCssVariables.dark,
    '--seeds-subnav-text-active': '#c9c9c9',
    '--seeds-subnav-bg-active': '#3b3b3b',
    '--seeds-table-header-text': '#c9c9c9',
    '--seeds-table-header-bg': surfaces.dark.surface,
  },
}

describe('seedsPalette', () => {
  it('defines the same --seeds tokens in light and dark', () => {
    const seedsKeys = (map: object) => Object.keys(map).filter((k) => k.startsWith('--seeds-')).sort()
    expect(seedsKeys(seedsCssVariables.light)).toEqual(seedsKeys(seedsCssVariables.dark))
    expect(seedsKeys(seedsCssVariables.light)).toHaveLength(38)
  })

  it.each(existingDarkOverrides)('keeps the Mantine variable reference for %s in dark', (token) => {
    expect(seedsCssVariables.dark[token].startsWith('var(--mantine-color-')).toBe(true)
  })

  describe.each(['light', 'dark'] as const)('%s text contrast', (mode) => {
    const map = resolved[mode]
    const { page, surface } = surfaces[mode]

    it.each([page, surface])('dimmed and placeholder on %s', (bg) => {
      expect(contrast(map['--mantine-color-dimmed'], bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(map['--mantine-color-placeholder'], bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(textPairs)('%s on %s', (text, bg) => {
      expect(contrast(map[text], map[bg])).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('light secondary and primary text on the page', () => {
    expect(contrast(seedsCssVariables.light['--seeds-text-primary'], surfaces.light.page)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(seedsCssVariables.light['--seeds-text-secondary'], surfaces.light.page)).toBeGreaterThanOrEqual(4.5)
  })

  it('red[6] on white and dark error on dark surfaces', () => {
    expect(seedsColors.red[6]).toBe('#9e241c')
    expect(contrast(seedsColors.red[6], '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(seedsCssVariables.dark['--mantine-color-error'], surfaces.dark.page)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(seedsCssVariables.dark['--mantine-color-error'], surfaces.dark.surface)).toBeGreaterThanOrEqual(4.5)
  })

  describe.each(['light', 'dark'] as const)('%s non-text contrast', (mode) => {
    const map = resolved[mode]
    const { page, surface } = surfaces[mode]

    it.each([page, surface])('borders on %s', (bg) => {
      const borders = [
        '--mantine-color-default-border',
        '--seeds-border-default',
        '--seeds-card-border',
        '--seeds-table-border',
      ] as const
      borders.forEach((border) => {
        const value = mode === 'dark' && map[border].startsWith('var(') ? map['--mantine-color-default-border'] : map[border]
        expect(contrast(value, bg)).toBeGreaterThanOrEqual(3)
      })
    })

    it.each([1, 2, 3, 4] as const)('chart %s on surface', (n) => {
      expect(contrast(map[`--seeds-chart-${n}`], surface)).toBeGreaterThanOrEqual(3)
    })
  })

  it('primary ramp step 4 works as dark focus ring and fill', () => {
    expect(contrast(seedsColors.seeds[4], surfaces.dark.page)).toBeGreaterThanOrEqual(3)
    expect(contrast(seedsColors.seeds[4], surfaces.dark.surface)).toBeGreaterThanOrEqual(3)
  })

  it('autoContrast text on filled primary stays readable', () => {
    expect(isLightColor(seedsColors.seeds[4])).toBe(true)
    expect(contrast('#000000', seedsColors.seeds[4])).toBeGreaterThanOrEqual(4.5)
    expect(isLightColor(seedsColors.seeds[6])).toBe(false)
    expect(contrast('#ffffff', seedsColors.seeds[6])).toBeGreaterThanOrEqual(4.5)
    expect(isLightColor(seedsColors.red[4])).toBe(true)
    expect(contrast('#000000', seedsColors.red[4])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(seedsColors.seeds[9], seedsColors.seeds[4])).toBeGreaterThanOrEqual(4.5)
  })

  it('resolver returns the maps', () => {
    expect(seedsCssVariablesResolver(seedsTheme)).toEqual({
      variables: {},
      light: seedsCssVariables.light,
      dark: seedsCssVariables.dark,
    })
  })

  it('keeps the exact chosen hexes', () => {
    expect(seedsCssVariables.light['--mantine-color-dimmed']).toBe('#434849')
    expect(seedsCssVariables.light['--seeds-chart-1']).toBe('#2e7d32')
    expect(seedsCssVariables.light['--seeds-chart-3']).toBe('#b35900')
    expect(seedsCssVariables.dark['--mantine-color-default-border']).toBe('#8a8a8a')
  })
})
