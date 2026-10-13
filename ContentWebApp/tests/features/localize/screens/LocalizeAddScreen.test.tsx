import { Notifications } from '@mantine/notifications'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { createSite } from '@features/localize/api/sites'
import { LocalizeAddScreen } from '@features/localize/screens/LocalizeAddScreen'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({}),
}))

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn().mockResolvedValue([]),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}))

vi.mock('@shared/services/languages', () => ({
  getLanguages: vi.fn().mockResolvedValue([]),
}))

function registerSite() {
  renderWithProviders(
    <>
      <Notifications />
      <LocalizeAddScreen />
    </>,
  )
  fireEvent.change(screen.getByLabelText('Domain or URL'), {
    target: { value: 'https://new.example.org/x' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add site' }))
}

describe('LocalizeAddScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  })

  it('registers the site by domain without any project', async () => {
    vi.mocked(createSite).mockImplementation(async (v) => ({
      id: 's1',
      site_id: 'x',
      api_base: '',
      updated_at: '',
      ...v,
    }))
    registerSite()
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    expect(vi.mocked(createSite).mock.calls[0][0]).toEqual({
      domain: 'new.example.org',
      name: '',
      status: 'Active',
      languages: [],
    })
    expect(await screen.findByText('Site registered.')).toBeInTheDocument()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/localize' }))
  })

  it('has no Project field', () => {
    renderWithProviders(<LocalizeAddScreen />)
    expect(screen.queryByText('Project', { selector: 'label' })).not.toBeInTheDocument()
  })

  it('a failed registration shows the backend message and stays on the form', async () => {
    vi.mocked(createSite).mockRejectedValue(
      new Error("Website with domain 'new.example.org' already exists"),
    )
    registerSite()
    expect(
      await screen.findByText("Website with domain 'new.example.org' already exists"),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add site' })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('a messageless failure stays on the form without navigating', async () => {
    vi.mocked(createSite).mockRejectedValue({})
    registerSite()
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    await waitFor(() => expect(navigate).not.toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Add site' })).toBeInTheDocument()
  })
})

