import { describe, expect, it } from 'vitest'

import { deriveNameFromDomain } from '@features/localize/utils/siteName'

describe('deriveNameFromDomain', () => {
  it.each([
    ['example-school.org', 'Example School'],
    ['my-cool-site.com', 'My Cool Site'],
    ['foo_bar.net', 'Foo Bar'],
    ['localhost', 'Localhost'],
    ['www.example.com', 'Example'],
    ['school.co.uk', 'School'],
    ['charity.org.uk', 'Charity'],
    ['college.ac.uk', 'College'],
    ['shop.com.au', 'Shop'],
    ['uni.edu.au', 'Uni'],
    ['www.green-valley-school.co.in', 'Green Valley School'],
    ['iit.ac.in', 'Iit'],
    ['school.edu.in', 'School'],
    ['loja.com.br', 'Loja'],
  ])('%s becomes %s', (domain, expected) => {
    expect(deriveNameFromDomain(domain)).toBe(expected)
  })

  it('keeps ordinary subdomains', () => {
    expect(deriveNameFromDomain('blog.example.com')).toBe('Blog Example')
  })

  it('removes only the last label for an unknown multi-part suffix', () => {
    expect(deriveNameFromDomain('school.edu.sg')).toBe('School Edu')
  })

  it('ignores surrounding whitespace and letter case', () => {
    expect(deriveNameFromDomain('  WWW.Example-School.CO.UK  ')).toBe('Example School')
  })
})
