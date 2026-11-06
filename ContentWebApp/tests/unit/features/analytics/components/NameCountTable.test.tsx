import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { NameCountTable } from '@features/analytics/components/NameCountTable'

describe('NameCountTable', () => {
  it('uses Label and Value headers', () => {
    renderWithProviders(<NameCountTable rows={[{ label: 'Hindi', count: 3 }]} />)
    expect(screen.getByRole('columnheader', { name: 'Label' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument()
  })
})
