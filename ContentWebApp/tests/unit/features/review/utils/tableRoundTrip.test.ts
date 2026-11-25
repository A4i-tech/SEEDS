import { Editor } from '@tiptap/core'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { maskRaw, unmaskRaw } from '@features/review/utils/rawTokens'

function roundTrip(markdown: string) {
  const { text, tokens } = maskRaw(markdown)
  const editor = new Editor({
    extensions: [StarterKit.configure({ underline: false, link: false }), Markdown, TableKit],
    content: text,
    contentType: 'markdown',
  })
  const output = unmaskRaw(editor.getMarkdown(), tokens)
  editor.destroy()
  return output
}

const grid = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line))
    .map((line) => line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim()))

describe('tables through the editor', () => {
  it('keeps every cell of a table, with the text around it', () => {
    const md = 'Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nOutro'
    const out = roundTrip(md)
    expect(grid(out)).toEqual([['A', 'B'], ['1', '2'], ['3', '4']])
    expect(out).toContain('Intro')
    expect(out).toContain('Outro')
  })

  it('keeps Tamil cells', () => {
    const md = '| அலகு முறை | நீளம் |\n| --- | --- |\n| CGS | சென்டிமீட்டர் |'
    expect(grid(roundTrip(md))).toEqual([['அலகு முறை', 'நீளம்'], ['CGS', 'சென்டிமீட்டர்']])
  })

  it('keeps an escaped pipe inside a cell as one cell', () => {
    const md = '| A | B |\n| --- | --- |\n| x \\| y | 2 |'
    expect(grid(roundTrip(md))).toEqual([['A', 'B'], ['x \\| y', '2']])
  })

  it('keeps inline math inside a cell', () => {
    const md = '| A | B |\n| --- | --- |\n| $x^2$ | 10^3 |'
    expect(grid(roundTrip(md))[1]).toEqual(['$x^2$', '10^3'])
  })
})
