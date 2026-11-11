import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { StatCards } from '@features/analytics/components/StatCards'

describe('StatCards', () => {
  it('labels the loading grid', () => {
    renderWithProviders(<StatCards cards={[]} loading />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })
})
