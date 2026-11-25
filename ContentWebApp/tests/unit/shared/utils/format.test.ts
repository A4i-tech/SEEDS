import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@shared/i18n'
import { formatRelativeTime } from '@shared/utils/format'

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
  })

  it('formats same-year dates in the app language', () => {
    expect(formatRelativeTime(new Date(2026, 9, 3).toISOString())).toBe('Oct 3')
  })

  it('adds the year for earlier years', () => {
    expect(formatRelativeTime(new Date(2025, 9, 3).toISOString())).toBe('Oct 3, 2025')
  })

  it('follows the language at call time', async () => {
    await i18n.changeLanguage('en-GB')
    expect(formatRelativeTime(new Date(2026, 9, 3).toISOString())).toBe('3 Oct')
  })
})
