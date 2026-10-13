import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { SiteSnippetModal } from '../../../../src/features/localize/components/SiteSnippetModal'
import { devToolsSnippet } from '../../../../src/features/localize/utils/siteSnippets'
import { API_BASE_URL } from '@/config/env'

const writeText = vi.fn()

function renderModal(sdkCode: string, devToolsCode: string) {
  renderWithProviders(
    <SiteSnippetModal opened title="Snippet" sdkCode={sdkCode} devToolsCode={devToolsCode} onClose={vi.fn()} />,
  )
}

describe('SiteSnippetModal', () => {
  it('shows the snippet and copies it with a success label', async () => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderModal('<script src="x"></script>', 'dev')
    expect(screen.getByText('<script src="x"></script>')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])
    expect(await screen.findByRole('button', { name: 'Copied to clipboard.' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('<script src="x"></script>')
  })

  it('copies an empty string when there is no snippet', async () => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderModal('', '')
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])
    await screen.findByRole('button', { name: 'Copied to clipboard.' })
    expect(writeText).toHaveBeenCalledWith('')
  })

  it('builds an injection script for the given site and API base', () => {
    const code = devToolsSnippet('abc-123', '', window.location.origin)
    renderModal('sdk', code)
    expect(screen.getByText('Developer testing (Chrome DevTools)')).toBeInTheDocument()
    expect(code).toContain(`s.src = "${window.location.origin}/sdk.js";`)
    expect(code).toContain('s.dataset.siteId = "abc-123";')
    expect(code).toContain(`s.dataset.apiBase = "${API_BASE_URL}";`)
    expect(code).toContain('document.body.appendChild(s);')
  })

  it('its script can be copied through the shared snippet block', async () => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderModal('sdk', devToolsSnippet('site-9', '', window.location.origin))
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[1])
    await screen.findByRole('button', { name: 'Copied to clipboard.' })
    expect(writeText.mock.calls[0][0]).toContain('s.dataset.siteId = "site-9";')
  })
})

