import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageTitle } from '@shared/components/PageTitle'
import { renderWithProviders } from '../../test-utils/renderWithProviders'

describe('PageTitle', () => {
  it('renders the level 1 heading and sets the document title', () => {
    renderWithProviders(<PageTitle title="Library" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
    expect(document.title).toBe('Library')
  })
})
