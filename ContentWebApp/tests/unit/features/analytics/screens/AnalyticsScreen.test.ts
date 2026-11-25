import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@shared/i18n'
import { formatRangeLabel } from '@features/analytics/screens/AnalyticsScreen'

describe('formatRangeLabel', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('formats in the app language', () => {
    expect(formatRangeLabel(new Date(2026, 9, 3), new Date(2026, 10, 2))).toBe('Oct 3 – Nov 2 2026')
  })

  it('follows the language at call time', async () => {
    await i18n.changeLanguage('en-GB')
    expect(formatRangeLabel(new Date(2026, 9, 3), new Date(2026, 10, 2))).toBe('3 Oct – 2 Nov 2026')
  })
})
