import { describe, expect, it } from 'vitest'

import { filterByName } from '@features/registration/utils/filterByName'

const rows = [{ name: 'Asha Rao' }, { name: 'Bhanu' }, { name: 'asha Kumar' }]

describe('filterByName', () => {
  it('returns all rows for a blank query', () => {
    expect(filterByName(rows, '  ')).toEqual(rows)
  })

  it('matches case-insensitively on a substring', () => {
    expect(filterByName(rows, 'ASHA')).toEqual([rows[0], rows[2]])
  })

  it('returns nothing when no name matches', () => {
    expect(filterByName(rows, 'zzz')).toEqual([])
  })
})
