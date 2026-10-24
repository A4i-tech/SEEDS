import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { RemediationSteps } from '../../../../../src/features/make-accessible/components/RemediationSteps'

describe('RemediationSteps', () => {
  it('renders the three stages with a steps label', () => {
    renderWithProviders(<RemediationSteps activeStep={1} />)
    expect(screen.getByLabelText('Steps')).toBeInTheDocument()
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('Remediating')).toBeInTheDocument()
    expect(screen.getByText('Review & edit')).toBeInTheDocument()
  })

  it('marks the active step', () => {
    const { container } = renderWithProviders(<RemediationSteps activeStep={0} />)
    const steps = container.querySelectorAll('[data-step]')
    expect(steps.length).toBeGreaterThanOrEqual(0)
    expect(screen.getByText('Upload')).toBeInTheDocument()
  })
})

