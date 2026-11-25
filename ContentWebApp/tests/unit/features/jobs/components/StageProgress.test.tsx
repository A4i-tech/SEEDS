import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { StageProgress } from '@features/jobs/components/StageProgress'

const base = { stage_count: 3, progress: { message: '', percent: 0 } }

describe('StageProgress', () => {
  it('marks the running stage current and shows the bar and message', () => {
    renderWithProviders(
      <StageProgress job={{ ...base, status: 'running', stage_index: 1, progress: { message: 'extracted 5/13', percent: 38 } }} />,
    )
    expect(screen.getByText('OCR').closest('[aria-current]')?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('Review').closest('[aria-current]')).toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Remediation progress' })).toBeTruthy()
    expect(screen.getByText('extracted 5/13 (38%)')).toBeTruthy()
  })

  it('has no current stage and no bar once the job is ready to review', () => {
    renderWithProviders(<StageProgress job={{ ...base, status: 'ready_to_review', stage_index: 3 }} />)
    expect(screen.getByText('Build documents').closest('[aria-current]')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('names the stage position for assistive tech', () => {
    renderWithProviders(<StageProgress job={{ ...base, status: 'running', stage_index: 2 }} />)
    expect(screen.getByRole('status', { name: 'Stage 2 of 3' })).toBeTruthy()
  })
})
