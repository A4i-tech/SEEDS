import { describe, expect, it } from 'vitest'

import { pageContent, splitIntoPages, toPlainText } from '@features/review/utils/remediationPages'

describe('splitIntoPages', () => {
  it('returns no pages for an empty string', () => {
    expect(splitIntoPages('')).toEqual([])
  })

  it('splits on page markers', () => {
    const pages = splitIntoPages('<!-- page 1 -->\n\na\n\n<!-- page 2 -->\n\nb')
    expect(pages.map((p) => p.pageNum)).toEqual([1, 2])
    expect(pages[0].content.startsWith('<!-- page 1 -->')).toBe(true)
    expect(pages[1].content.startsWith('<!-- page 2 -->')).toBe(true)
  })

  it('chunks unmarked markdown at paragraph boundaries', () => {
    const paragraph = 'x'.repeat(1000)
    const pages = splitIntoPages(Array(8).fill(paragraph).join('\n\n'))
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.map((p) => p.pageNum)).toEqual(pages.map((_, i) => i + 1))
    expect(pages.every((p) => p.content.length <= 3500)).toBe(true)
  })
})

describe('pageContent', () => {
  it('returns an empty string past the last page', () => {
    expect(pageContent([{ pageNum: 1, content: 'a' }], 5)).toBe('')
  })
})

describe('toPlainText', () => {
  it('drops image tags', () => {
    expect(toPlainText('a <image src="x.png"> b')).not.toContain('<image')
  })

  it('keeps math text without tags', () => {
    const text = toPlainText('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>')
    expect(text).toContain('x+1')
    expect(text).not.toContain('<')
  })

  it('does not leak script or style text', () => {
    expect(toPlainText('hi<script>alert(1)</script>')).toBe('hi')
    expect(toPlainText('hi<style>p{color:red}</style>')).toBe('hi')
  })

  it('decodes entities exactly once', () => {
    expect(toPlainText('a &amp;lt; b')).toBe('a &lt; b')
    expect(toPlainText('x &lt; y')).toBe('x < y')
  })
})
