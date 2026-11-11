import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@shared/i18n'
import { formatDay } from '@features/analytics/components/Charts'

describe('formatDay', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('formats in the app language', () => {
    expect(formatDay('2026-11-02')).toBe('Nov 2')
  })

  it('follows the language at call time', async () => {
    await i18n.changeLanguage('en-GB')
    expect(formatDay('2026-11-02')).toBe('2 Nov')
  })
})
