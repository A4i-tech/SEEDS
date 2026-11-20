import { describe, expect, it } from 'vitest'

import { defaultBookTitle } from '@features/make-accessible/utils/bookTitle'

describe('defaultBookTitle', () => {
  it('removes the extension', () => {
    expect(defaultBookTitle('Physics.PDF')).toBe('Physics')
  })

  it.each([
    ['Class7_Science_Unit_2.pdf', 'Class7 Science'],
    ['Maths Chapter 3.pdf', 'Maths'],
    ['History-ch4.pdf', 'History'],
    ['Geography 12.pdf', 'Geography'],
    ['Civics_UNIT-9.pdf', 'Civics'],
  ])('removes the trailing unit or chapter number from %s', (name, title) => {
    expect(defaultBookTitle(name)).toBe(title)
  })

  it('turns underscores into spaces and trims', () => {
    expect(defaultBookTitle('  Class_7_Science  .pdf')).toBe('Class 7 Science')
  })

  it('keeps a name that is only a number', () => {
    expect(defaultBookTitle('2024.pdf')).toBe('2024')
  })
})
