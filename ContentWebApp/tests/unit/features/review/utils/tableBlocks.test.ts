import { describe, expect, it } from 'vitest'

import { buildTable, parseTable } from '@features/review/utils/tableBlocks'

const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

describe('parseTable', () => {
  it('reads the header and the rows', () => {
    expect(parseTable(table)).toEqual({ header: ['A', 'B'], rows: [['1', '2'], ['3', '4']] })
  })

  it('round-trips through buildTable', () => {
    expect(buildTable(parseTable(table)!)).toBe(table)
  })

  it('keeps an escaped pipe inside a cell', () => {
    const md = '| A | B |\n| --- | --- |\n| x \\| y | 2 |'
    expect(parseTable(md)!.rows[0][0]).toBe('x | y')
    expect(buildTable(parseTable(md)!)).toBe(md)
  })

  it('returns null when a row has a different number of cells', () => {
    expect(parseTable('| A | B |\n| --- | --- |\n| 1 |')).toBeNull()
  })

  it('returns null when the header row is broken across lines', () => {
    expect(parseTable('| A | B\n|\n| --- | --- |\n| 1 | 2 |')).toBeNull()
  })

  it('returns null for text that is not a table', () => {
    expect(parseTable('just text | with a pipe')).toBeNull()
  })
})
