import { fireEvent, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { SourceText } from '@features/localize/components/SourceText'
import { truncateMiddle } from '@features/localize/utils/truncateMiddle'

const CHAR_WIDTH = 8
const box = { width: 1000 }

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
  } as unknown as CanvasRenderingContext2D)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => box.width })
})

afterAll(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

describe('truncateMiddle', () => {
  it('keeps text that fits', () => {
    expect(truncateMiddle('abc', 40, '10px x')).toBe('abc')
  })

  it('keeps the start and the end of text that does not fit', () => {
    expect(truncateMiddle('abcdefghij', 40, '10px x')).toBe('ab…ij')
  })
})

describe('SourceText', () => {
  it('shows no toggle when the text fits', () => {
    box.width = 1000
    renderWithProviders(<SourceText text="Short text" />)
    expect(screen.getByText('Short text')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('truncates in the middle and expands on Show more', () => {
    box.width = 80
    renderWithProviders(<SourceText text="Autoplay is on. Use the Pause button" />)
    expect(screen.queryByText('Autoplay is on. Use the Pause button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show full source text' }))
    expect(screen.getByText('Autoplay is on. Use the Pause button')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show less source text' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show less source text' }))
    expect(screen.queryByText('Autoplay is on. Use the Pause button')).toBeNull()
  })
})
