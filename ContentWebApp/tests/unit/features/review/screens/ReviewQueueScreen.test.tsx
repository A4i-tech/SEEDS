import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { getRemediationJobs } from '@features/jobs/api/remediationJobs'
import { ReviewQueueScreen } from '@features/review/screens/ReviewQueueScreen'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@features/jobs/api/remediationJobs', () => ({ getRemediationJobs: vi.fn() }))

describe('ReviewQueueScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getRemediationJobs).mockResolvedValue([])
  })

  it('requests the maximum number of jobs', async () => {
    renderWithProviders(<ReviewQueueScreen />)
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledWith(200))
  })
})
