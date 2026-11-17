import { describe, expect, it } from 'vitest'

import { readFigure, writeFigure } from '@features/review/utils/remediationFigures'

const page = '<!-- page 2 -->\n\nText\n\n![A plant](images/p-1.png "A green plant")\n\n![Other](images/p-2.png)'

describe('readFigure', () => {
  it('reads alt and description of the named figure', () => {
    expect(readFigure(page, 'p-1.png')).toEqual({ alt: 'A plant', description: 'A green plant' })
    expect(readFigure(page, 'p-2.png')).toEqual({ alt: 'Other', description: '' })
  })

  it('returns null when the figure is not on the page', () => {
    expect(readFigure(page, 'p-9.png')).toBeNull()
  })
})

describe('writeFigure', () => {
  it('rewrites only the named figure', () => {
    const next = writeFigure(page, 'p-1.png', { alt: 'Fern', description: 'A "fern"\nin a pot' })
    expect(next).toContain('![Fern](images/p-1.png "A \'fern\' in a pot")')
    expect(next).toContain('![Other](images/p-2.png)')
  })

  it('drops the title when the description is empty', () => {
    expect(writeFigure(page, 'p-1.png', { alt: 'A plant', description: ' ' })).toContain('![A plant](images/p-1.png)')
  })

  it('keeps dollar signs in the new text literal', () => {
    expect(writeFigure(page, 'p-2.png', { alt: "costs $& more", description: '' })).toContain('![costs $& more](images/p-2.png)')
  })
})
