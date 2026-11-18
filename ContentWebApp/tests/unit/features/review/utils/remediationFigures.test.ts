import { describe, expect, it } from 'vitest'

import { figureMarkdown, joinSegments, splitSegments } from '@features/review/utils/remediationFigures'

const page = '<!-- page 2 -->\n\nIntro\n\nMore text\n\n![A plant](images/p-1.png "A green plant")\n\nMiddle\n\n![Other](images/p-2.png)'

describe('splitSegments', () => {
  it('keeps figures as their own segments between text', () => {
    expect(splitSegments(page)).toEqual([
      { type: 'text', markdown: '<!-- page 2 -->\n\nIntro\n\nMore text' },
      { type: 'figure', imageName: 'p-1.png', figure: { alt: 'A plant', description: 'A green plant' } },
      { type: 'text', markdown: 'Middle' },
      { type: 'figure', imageName: 'p-2.png', figure: { alt: 'Other', description: '' } },
    ])
  })

  it('does not treat an image inside a paragraph as a figure block', () => {
    expect(splitSegments('See ![x](images/a.png) here')).toEqual([{ type: 'text', markdown: 'See ![x](images/a.png) here' }])
  })

  it('returns an empty text segment for an empty page', () => {
    expect(splitSegments('')).toEqual([{ type: 'text', markdown: '' }])
  })
})

describe('joinSegments', () => {
  it('round-trips a page', () => {
    expect(joinSegments(splitSegments(page))).toBe(page)
  })

  it('rewrites only the edited figure', () => {
    const segments = splitSegments(page)
    segments[1] = { type: 'figure', imageName: 'p-1.png', figure: { alt: 'Fern', description: 'A "fern"\nin a pot' } }
    const next = joinSegments(segments)
    expect(next).toContain('![Fern](images/p-1.png "A \'fern\' in a pot")')
    expect(next).toContain('![Other](images/p-2.png)')
  })
})

describe('figureMarkdown', () => {
  it('drops the title when the description is blank', () => {
    expect(figureMarkdown('p-1.png', { alt: 'A plant', description: ' ' })).toBe('![A plant](images/p-1.png)')
  })
})
