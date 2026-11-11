import { Notifications } from '@mantine/notifications'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { createSite, listSites, updateSite } from '@features/localize/api/sites'
import { LocalizeAddScreen } from '@features/localize/screens/LocalizeAddScreen'

const navigate = vi.fn()
const params = vi.hoisted(() => ({ current: {} as { siteId?: string } }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => params.current,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/localize">{children}</a>,
}))

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn().mockResolvedValue([]),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}))

vi.mock('@shared/services/languages', () => ({
  getLanguages: vi.fn().mockResolvedValue([
    { code: 'hi', name: 'Hindi' },
    { code: 'kn', name: 'Kannada' },
  ]),
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
  fireEvent.click(screen.getByRole('button', { name: 'Start localization (0 languages)' }))
}

describe('LocalizeAddScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    params.current = {}
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
    expect(screen.getByRole('button', { name: 'Start localization (0 languages)' })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('a messageless failure stays on the form without navigating', async () => {
    vi.mocked(createSite).mockRejectedValue({})
    registerSite()
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    await waitFor(() => expect(navigate).not.toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Start localization (0 languages)' })).toBeInTheDocument()
  })

  it('editing keeps disabled languages and their enabled flag on save', async () => {
    params.current = { siteId: 's1' }
    const site = {
      id: 's1',
      site_id: 'x',
      domain: 'a.com',
      name: '',
      status: 'Active',
      languages: [
        { code: 'hi', enabled: true },
        { code: 'kn', enabled: false },
      ],
      api_base: '',
      updated_at: '',
    }
    vi.mocked(listSites).mockResolvedValue([site])
    vi.mocked(updateSite).mockResolvedValue(site)
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalled())
    expect(vi.mocked(updateSite).mock.calls[0]).toEqual([
      's1',
      { domain: 'a.com', name: '', status: 'Active', languages: site.languages },
    ])
  })

  it('toggling a language off saves it as disabled', async () => {
    params.current = { siteId: 's1' }
    const site = {
      id: 's1',
      site_id: 'x',
      domain: 'a.com',
      name: '',
      status: 'Active',
      languages: [{ code: 'hi', enabled: true }],
      api_base: '',
      updated_at: '',
    }
    vi.mocked(listSites).mockResolvedValue([site])
    vi.mocked(updateSite).mockResolvedValue(site)
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.click(await screen.findByRole('switch', { name: /^Hindi · Language enabled/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalled())
    expect(vi.mocked(updateSite).mock.calls[0][1].languages).toEqual([{ code: 'hi', enabled: false }])
  })

  it('labels the site status and language enabled controls with hints', async () => {
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Hindi' }))
    expect(screen.getByText('Site status')).toBeInTheDocument()
    expect(screen.getByText('The site must be Active for the SDK to serve any translations.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /^Hindi · Language enabled/ })).toBeInTheDocument()
    expect(screen.getByText('Only enabled languages are served on the site.')).toBeInTheDocument()
  })

  it('shows the selected count in the submit label and clears the selection', async () => {
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Hindi' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kannada' }))
    expect(screen.getByRole('button', { name: 'Start localization (2 languages)' })).toBeInTheDocument()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('button', { name: 'Start localization (0 languages)' })).toBeInTheDocument()
  })

  it('filters visible language chips by the search box', async () => {
    renderWithProviders(<LocalizeAddScreen />)
    await screen.findByRole('checkbox', { name: 'Hindi' })
    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'kan' } })
    expect(screen.queryByRole('checkbox', { name: 'Hindi' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Kannada' })).toBeInTheDocument()
  })
})
