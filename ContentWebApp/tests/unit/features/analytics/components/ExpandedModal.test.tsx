import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { ExpandedModal } from '@features/analytics/components/ExpandedModal'

describe('ExpandedModal', () => {
  it('renders title and children, and closes from back and Close', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <ExpandedModal title="Calls by language" onClose={onClose}>
        <p>chart body</p>
      </ExpandedModal>,
    )
    expect(screen.getByRole('heading', { name: 'Calls by language' })).toBeInTheDocument()
    expect(screen.getByText('chart body')).toBeInTheDocument()
    expect(document.querySelector('.mantine-Modal-content')).toHaveAttribute('data-full-screen')
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
