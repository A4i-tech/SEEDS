import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import {
  assignRemediationJob,
  deleteRemediationJob,
  downloadRemediationArtifact,
  getRemediationJobs,
} from '@features/jobs/api/remediationJobs'
import { getVolunteers } from '@features/registration/api/volunteers'
import { getActiveSyncJobs, getSyncJobs } from '@features/jobs/api/syncJobs'
import { JobsScreen } from '@features/jobs/screens/JobsScreen'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@features/registration/api/volunteers', () => ({ getVolunteers: vi.fn() }))
vi.mock('@features/jobs/api/remediationJobs', () => ({
  assignRemediationJob: vi.fn(),
  deleteRemediationJob: vi.fn(),
  downloadRemediationArtifact: vi.fn(),
  getRemediationJobs: vi.fn(),
}))
vi.mock('@features/jobs/api/syncJobs', () => ({ getSyncJobs: vi.fn(), getActiveSyncJobs: vi.fn() }))

const remediation = {
  job_id: 'job-1',
  source_name: 'book.pdf',
  status: 'verified' as const,
  draft_remediated_md: '',
  error: '',
  translation_error: '',
  artifacts: {},
  language: 'auto',
  detected_language: '',
  stage_index: 3,
  stage_count: 3,
  progress: { message: '', percent: 0 },
  source_page_count: 0,
  models: { ocr: '', verify: '', block_tree: '', alt_text: '', translation: '' },
  metrics: { processed_pages: 0, diagrams_described: 0, tables_fixed: 0, flagged_items_count: 0 },
  created_at: '2026-01-02',
  finished_at: '',
  assigned_to: '',
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
    vi.mocked(getVolunteers).mockResolvedValue([{ id: 'vol-1', name: 'Ann', email: 'ann@x.com' }])
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

  it('separates View, Assign and Delete on a make-accessible done row', async () => {
    vi.mocked(getSyncJobs).mockResolvedValue([])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    expect(document.querySelectorAll('[data-separator]')).toHaveLength(2)
  })

  it('assigns a job to the chosen volunteer and shows the assignee', async () => {
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(assignRemediationJob).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    expect(screen.getByText('Unassigned')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Volunteer' }))
    fireEvent.click(await screen.findByText('Ann (ann@x.com)'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Assign' }))
    await waitFor(() =>
      expect(vi.mocked(assignRemediationJob).mock.calls[0]?.[0]).toEqual({ jobId: 'job-1', volunteerId: 'vol-1', force: false }),
    )
  })

  it('reassigns with force when the job already has an assignee', async () => {
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(getVolunteers).mockResolvedValue([
      { id: 'vol-1', name: 'Ann', email: 'ann@x.com' },
      { id: 'vol-2', name: 'Bo', email: 'bo@x.com' },
    ])
    vi.mocked(getRemediationJobs).mockResolvedValue([{ ...remediation, assigned_to: 'vol-1' }])
    vi.mocked(assignRemediationJob).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    expect(await screen.findByText('Ann')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Volunteer' }))
    fireEvent.click(await screen.findByText('Bo (bo@x.com)'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Assign' }))
    await waitFor(() =>
      expect(vi.mocked(assignRemediationJob).mock.calls[0]?.[0]).toEqual({ jobId: 'job-1', volunteerId: 'vol-2', force: true }),
    )
  })

  it('shows needs attention for completed syncs with failures', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([])
    vi.mocked(getSyncJobs).mockResolvedValue([{ ...sync, stats: { ...sync.stats, failed: 1 } }])
    renderWithProviders(<JobsScreen />)
    expect(await screen.findByText('Needs attention')).toBeTruthy()
  })

  it('opens a done make-accessible job in the review screen', async () => {
    vi.mocked(getSyncJobs).mockResolvedValue([])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/review/remediate/$jobId', params: { jobId: 'job-1' } })
  })

  it('opens a running make-accessible job on its progress page', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([{ ...remediation, status: 'running' }])
    vi.mocked(getSyncJobs).mockResolvedValue([])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/make-accessible/$jobId', params: { jobId: 'job-1' } })
  })

  it('opens a course sync on its progress page', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([])
    renderWithProviders(<JobsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/jobs/$jobId', params: { jobId: 'sync-1' } })
  })

  it('downloads an artifact from the row menu', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([{ ...remediation, artifacts: { docx: 'u', translated_pdf: 'u' } }])
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(downloadRemediationArtifact).mockResolvedValue(undefined)
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(screen.queryByRole('menuitem', { name: 'Download PDF' })).toBeNull()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Download translated PDF' }))
    await waitFor(() =>
      expect(downloadRemediationArtifact).toHaveBeenCalledWith('job-1', 'translated_pdf', 'book.translated.pdf'),
    )
  })
})

describe('JobsScreen download all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getSyncJobs).mockResolvedValue([])
    vi.mocked(getActiveSyncJobs).mockResolvedValue([])
    vi.mocked(downloadRemediationArtifact).mockResolvedValue(undefined)
  })

  it('downloads every available artifact from the Download all item', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([{ ...remediation, artifacts: { docx: 'u', pdf: 'u' } }])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Download all' }))
    await waitFor(() => expect(downloadRemediationArtifact).toHaveBeenCalledTimes(2))
  })

  it('offers no Download all when there is a single artifact', async () => {
    vi.mocked(getRemediationJobs).mockResolvedValue([{ ...remediation, artifacts: { docx: 'u' } }])
    renderWithProviders(<JobsScreen />)
    await screen.findByText('book.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await screen.findByRole('menuitem', { name: 'Download Word' })
    expect(screen.queryByRole('menuitem', { name: 'Download all' })).toBeNull()
  })
})
