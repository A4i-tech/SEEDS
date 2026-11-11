import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { deleteRemediationJob, getRemediationJobs } from '@features/jobs/api/remediationJobs'
import { getActiveSyncJobs, getSyncJobs } from '@features/jobs/api/syncJobs'
import { JobsScreen } from '@features/jobs/screens/JobsScreen'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@features/jobs/api/remediationJobs', () => ({ deleteRemediationJob: vi.fn(), getRemediationJobs: vi.fn() }))
vi.mock('@features/jobs/api/syncJobs', () => ({ getSyncJobs: vi.fn(), getActiveSyncJobs: vi.fn() }))

const remediation = {
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'verified' as const,
  draft_remediated_md: '',
  error: '',
  created_at: '2026-01-02',
  finished_at: '',
}

const sync = {
  job_id: 'sync-1',
  scope: 'all',
  course_id: '',
  status: 'completed' as const,
  started_at: '2026-01-01',
  finished_at: '',
  total_courses: 1,
  processed: 1,
  stats: { saved: 1, skipped: 0, empty: 0, failed: 0 },
  error: '',
}

describe('JobsScreen delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getRemediationJobs).mockResolvedValue([remediation])
    vi.mocked(getSyncJobs).mockResolvedValue([sync])
    vi.mocked(getActiveSyncJobs).mockResolvedValue([])
  })

  it('offers delete only on make-accessible rows and deletes after confirmation', async () => {
    vi.mocked(deleteRemediationJob).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteRemediationJob).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete job' }))

    await waitFor(() => expect(vi.mocked(deleteRemediationJob).mock.calls[0]?.[0]).toBe('job-1'))
    await waitFor(() => expect(getRemediationJobs).toHaveBeenCalledTimes(2))
  })

  it('renders Fix as an outlined button and keeps View a link-style action', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([
      { ...remediation, job_id: 'job-2', source_name: 'bad.pdf', status: 'failed', error: 'boom' },
    ])
    vi.mocked(getSyncJobs).mockResolvedValue([sync])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('bad.pdf')
    expect(screen.getByRole('button', { name: /Fix/ })).toHaveAttribute('data-variant', 'outline')
    expect(screen.getByRole('button', { name: 'View' })).not.toHaveAttribute('data-variant', 'outline')
  })

  it('separates View and Delete on a make-accessible done row', async () => {
    vi.mocked(getSyncJobs).mockResolvedValue([])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    expect(document.querySelectorAll('[data-separator]')).toHaveLength(1)
  })

  it('shows needs attention for completed syncs with failures', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([])
    vi.mocked(getSyncJobs).mockResolvedValue([{ ...sync, stats: { ...sync.stats, failed: 1 } }])
    renderWithProviders(<JobsScreen />)
    expect(await screen.findByText('Needs attention')).toBeTruthy()
  })
})
