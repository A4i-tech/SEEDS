import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDisplayPreferences } from '@shared/hooks/useDisplayPreferences'

describe('useDisplayPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('mirrors the stored preferences onto the root element', () => {
    const { result } = renderHook(() => useDisplayPreferences())
    expect(document.documentElement.dataset.textSize).toBe('default')
    act(() => {
      result.current.setTextSize('large')
      result.current.setUnderlineLinks(true)
    })
    expect(document.documentElement.dataset.textSize).toBe('large')
    expect(document.documentElement.dataset.underlineLinks).toBe('true')
    expect(document.documentElement.dataset.reduceMotion).toBe('false')
  })
})
