import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useSyncedScroll } from '@features/review/hooks/useSyncedScroll'

const fakeFrame = (scrollHeight: number, clientHeight: number, scrollTop = 0) =>
  ({ scrollHeight, clientHeight, scrollTop }) as HTMLDivElement

function setup(scan: HTMLDivElement, draft: HTMLDivElement) {
  const { result } = renderHook(() => useSyncedScroll())
  const left = result.current.frame(0)
  const right = result.current.frame(1)
  left.viewportRef(scan)
  right.viewportRef(draft)
  return { result, left, right }
}

describe('useSyncedScroll', () => {
  it('moves the other frame by the same share of its own scroll range', () => {
    const scan = fakeFrame(1500, 500)
    const draft = fakeFrame(2500, 500)
    const { left } = setup(scan, draft)
    scan.scrollTop = 500
    left.onScroll()
    expect(draft.scrollTop).toBe(1000)
  })

  it('does not bounce the move it caused back to the first frame', () => {
    const scan = fakeFrame(1500, 500)
    const draft = fakeFrame(2500, 500)
    const { left, right } = setup(scan, draft)
    scan.scrollTop = 500
    left.onScroll()
    right.onScroll()
    expect(scan.scrollTop).toBe(500)
  })

  it('lets the second frame drive after the first move settled', () => {
    const scan = fakeFrame(1500, 500)
    const draft = fakeFrame(2500, 500)
    const { left, right } = setup(scan, draft)
    scan.scrollTop = 500
    left.onScroll()
    right.onScroll()
    draft.scrollTop = 2000
    right.onScroll()
    expect(scan.scrollTop).toBe(1000)
  })

  it('does nothing when a frame has nothing to scroll', () => {
    const scan = fakeFrame(400, 500)
    const draft = fakeFrame(2500, 500, 300)
    const { left } = setup(scan, draft)
    left.onScroll()
    expect(draft.scrollTop).toBe(300)
  })

  it('resets both frames to the top', () => {
    const scan = fakeFrame(1500, 500, 700)
    const draft = fakeFrame(2500, 500, 900)
    const { result } = setup(scan, draft)
    result.current.reset()
    expect([scan.scrollTop, draft.scrollTop]).toEqual([0, 0])
  })
})
