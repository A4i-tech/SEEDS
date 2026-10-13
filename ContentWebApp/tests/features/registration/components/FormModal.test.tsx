import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { FormModal } from '@features/registration/components/FormModal'

function renderModal(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn()
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
  renderWithProviders(
    <FormModal
      title="Add teacher"
      submitLabel="Save"
      mutation={{ error: null, isPending: false }}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    >
      <span>child field</span>
    </FormModal>,
  )
  return { onClose, onSubmit }
}

describe('FormModal', () => {
  it('renders title, children and submit', () => {
    renderModal()
    expect(screen.getByText('Add teacher')).toBeInTheDocument()
    expect(screen.getByText('child field')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('submits the form', () => {
    const { onSubmit } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the mutation error and disables submit while pending', () => {
    renderModal({ mutation: { error: new Error('phone taken'), isPending: true } })
    expect(screen.getByText('phone taken')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('respects an explicit submitDisabled', () => {
    renderModal({ submitDisabled: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
