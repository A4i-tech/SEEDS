import { describe, expect, it, vi } from 'vitest'

import { API_BASE_URL } from '@/config/env'
import { devToolsSnippet, sdkSnippet } from '../../../../src/features/localize/utils/siteSnippets'

vi.mock('@/config/env', () => ({ API_BASE_URL: 'https://api.example.com' }))

describe('sdkSnippet', () => {
  it('embeds src, site id and api base', () => {
    const code = sdkSnippet('site-1', 'https://api.example.com', 'https://app.example.com')
    expect(code).toContain('src="https://app.example.com/sdk.js"')
    expect(code).toContain('data-site-id="site-1"')
    expect(code).toContain('data-api-base="https://api.example.com"')
  })

  it('falls back to the configured api base', () => {
    expect(sdkSnippet('s', '', 'https://app.example.com')).toContain(
      `data-api-base="${API_BASE_URL}"`,
    )
  })
})

describe('devToolsSnippet', () => {
  it('builds an injection script for the given site and API base', () => {
    const code = devToolsSnippet('abc-123', '', 'https://app.example.com')
    expect(code).toContain('s.src = "https://app.example.com/sdk.js";')
    expect(code).toContain('s.dataset.siteId = "abc-123";')
    expect(code).toContain(`s.dataset.apiBase = "${API_BASE_URL}";`)
    expect(code).toContain('document.body.appendChild(s);')
  })
})
