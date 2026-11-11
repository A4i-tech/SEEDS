import { describe, expect, it } from 'vitest'
import { describeRaw, maskRaw, unmaskRaw } from '@features/review/utils/rawTokens'

const SAMPLE = [
  '<!-- page 3 -->',
  '',
  '# ಪರಿವಿಡಿ',
  '',
  'AB > DE and $\\angle B = \\angle E$ and <math><mi>x</mi></math>',
  '',
  '- <image id="abc"/>',
  '',
  '![alt text](images/a_img.jpg "title")',
].join('\n')

describe('rawTokens', () => {
  it('hides comments, image tags, math, figures and the > and \\ characters', () => {
    const { text, tokens } = maskRaw(SAMPLE)
    expect(text).not.toMatch(/<|>|\\|\$|!\[/)
    expect(tokens).toContain('<!-- page 3 -->')
    expect(tokens).toContain('![alt text](images/a_img.jpg "title")')
  })

  it('restores the original markdown exactly', () => {
    const { text, tokens } = maskRaw(SAMPLE)
    expect(unmaskRaw(text, tokens)).toBe(SAMPLE)
  })

  it('describes tokens for the editor chips', () => {
    expect(describeRaw('<!-- page 7 -->')).toEqual({ kind: 'page', page: '7' })
    expect(describeRaw('<image id="x"/>').kind).toBe('figure')
    expect(describeRaw('![a](b.jpg)').kind).toBe('figure')
    expect(describeRaw('$x$').kind).toBe('math')
    expect(describeRaw('>').kind).toBe('char')
  })
})
