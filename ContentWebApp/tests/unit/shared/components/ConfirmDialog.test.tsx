import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { openConfirmDialog } from '@shared/components/ConfirmDialog'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

function renderOpener(onConfirm: () => void) {
  renderWithProviders(
    <button
      onClick={() =>
        openConfirmDialog({ title: 'Delete it', body: 'Sure?', confirmLabel: 'Yes', cancelLabel: 'No', onConfirm })
      }
    >
      open
    </button>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
}

describe('openConfirmDialog', () => {
  it('has no close button', async () => {
    renderOpener(vi.fn())
    await screen.findByText('Sure?')
    expect(document.querySelector('.mantine-Modal-close')).toBeNull()
  })

  it('cancel dismisses without confirming', async () => {
    const onConfirm = vi.fn()
    renderOpener(onConfirm)
    fireEvent.click(await screen.findByRole('button', { name: 'No' }))
    await waitFor(() => expect(screen.queryByText('Sure?')).toBeNull())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirm calls onConfirm once', async () => {
    const onConfirm = vi.fn()
    renderOpener(onConfirm)
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('escape dismisses without confirming', async () => {
    const onConfirm = vi.fn()
    renderOpener(onConfirm)
    await screen.findByText('Sure?')
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Sure?')).toBeNull())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('overlay opacity is 0.55', async () => {
    renderOpener(vi.fn())
    await screen.findByText('Sure?')
    const overlay = document.querySelector('.mantine-Modal-overlay') as HTMLElement
    expect(overlay.getAttribute('style')).toContain('0.55')
  })
})
