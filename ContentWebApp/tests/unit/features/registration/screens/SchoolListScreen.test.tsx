import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useSchools } from '@features/registration/hooks/useSchools'
import { SchoolListScreen } from '@features/registration/screens/SchoolListScreen'

vi.mock('@features/registration/hooks/useSchools')

describe('SchoolListScreen', () => {
  it('shows the create school button with a plus icon', () => {
    vi.mocked(useSchools).mockReturnValue({
      state: { status: 'done', data: [] },
      schools: [],
      reload: vi.fn(),
      create: { mutateAsync: vi.fn() },
      update: { mutateAsync: vi.fn() },
      remove: { mutateAsync: vi.fn() },
    } as ReturnType<typeof useSchools>)
    renderWithProviders(<SchoolListScreen />)
    expect(screen.getByRole('button', { name: 'Create school' }).querySelector('svg')).not.toBeNull()
  })
})
