import { Notifications } from '@mantine/notifications'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { createSite, listSites, updateSite } from '@features/localize/api/sites'
import { LocalizeAddScreen } from '@features/localize/screens/LocalizeAddScreen'
import { getLanguages } from '@shared/services/languages'

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

async function registerSite() {
  renderWithProviders(
    <>
      <Notifications />
      <LocalizeAddScreen />
    </>,
  )
  fireEvent.change(screen.getByLabelText('Domain or URL'), {
    target: { value: 'https://new.example.org/x' },
  })
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Hindi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start localization (1 language)' }))
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
    await registerSite()
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    expect(vi.mocked(createSite).mock.calls[0][0]).toEqual({
      domain: 'new.example.org',
      name: 'New Example',
      status: 'Active',
      languages: [{ code: 'hi', enabled: true }],
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
    await registerSite()
    expect(
      await screen.findByText("Website with domain 'new.example.org' already exists"),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start localization (1 language)' })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('a messageless failure stays on the form without navigating', async () => {
    vi.mocked(createSite).mockRejectedValue({})
    await registerSite()
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    await waitFor(() => expect(navigate).not.toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Start localization (1 language)' })).toBeInTheDocument()
  })

  it('editing saves every selected language as enabled', async () => {
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
    expect(vi.mocked(updateSite).mock.calls[0][1].languages).toEqual([
      { code: 'hi', enabled: true },
      { code: 'kn', enabled: true },
    ])
  })

  it('labels the site status with a hint and has no per-language switch', async () => {
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Hindi' }))
    expect(screen.getByText('Site status')).toBeInTheDocument()
    expect(screen.getByText('The site must be Active for the SDK to serve any translations.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
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

  it('blocks registration until a language is selected', async () => {
    renderWithProviders(<LocalizeAddScreen />)
    await screen.findByRole('checkbox', { name: 'Hindi' })
    fireEvent.change(screen.getByLabelText('Domain or URL'), { target: { value: 'new.example.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start localization (0 languages)' }))
    expect(await screen.findByText('Select at least one language.')).toBeInTheDocument()
    expect(createSite).not.toHaveBeenCalled()
  })

  it('keeps a typed name instead of deriving one', async () => {
    vi.mocked(createSite).mockImplementation(async (v) => ({ id: 's1', site_id: 'x', api_base: '', updated_at: '', ...v }))
    renderWithProviders(<LocalizeAddScreen />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ABC School  ' } })
    fireEvent.change(screen.getByLabelText('Domain or URL'), { target: { value: 'www.abc-school.co.in' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Kannada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start localization (1 language)' }))
    await waitFor(() => expect(createSite).toHaveBeenCalled())
    expect(vi.mocked(createSite).mock.calls[0][0]).toMatchObject({
      name: 'ABC School',
      domain: 'www.abc-school.co.in',
      languages: [{ code: 'kn', enabled: true }],
    })
  })

  describe('editing', () => {
    const site = (codes: string[]) => ({
      id: 's1',
      site_id: 'x',
      domain: 'a.com',
      name: '',
      status: 'Active',
      languages: codes.map((code) => ({ code, enabled: true })),
      api_base: '',
      updated_at: '',
    })

    beforeEach(() => {
      params.current = { siteId: 's1' }
    })

    it('does not derive a name for a blank name', async () => {
      vi.mocked(listSites).mockResolvedValue([site(['hi'])])
      vi.mocked(updateSite).mockResolvedValue(site(['hi']))
      renderWithProviders(<LocalizeAddScreen />)
      await screen.findByRole('checkbox', { name: 'Hindi' })
      fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(updateSite).toHaveBeenCalled())
      expect(vi.mocked(updateSite).mock.calls[0][1].name).toBe('')
    })

    it('requires a language', async () => {
      vi.mocked(listSites).mockResolvedValue([site([])])
      renderWithProviders(<LocalizeAddScreen />)
      await screen.findByRole('checkbox', { name: 'Hindi' })
      fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
      expect(await screen.findByText('Select at least one language.')).toBeInTheDocument()
      expect(updateSite).not.toHaveBeenCalled()
    })

    it('sends only languages that are still available', async () => {
      vi.mocked(listSites).mockResolvedValue([site(['hi', 'xx'])])
      vi.mocked(updateSite).mockResolvedValue(site(['hi']))
      renderWithProviders(<LocalizeAddScreen />)
      await screen.findByRole('checkbox', { name: 'Hindi' })
      fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(updateSite).toHaveBeenCalled())
      expect(vi.mocked(updateSite).mock.calls[0][1].languages).toEqual([{ code: 'hi', enabled: true }])
    })

    it('blocks saving when no selected language is still available', async () => {
      vi.mocked(listSites).mockResolvedValue([site(['xx'])])
      renderWithProviders(<LocalizeAddScreen />)
      await screen.findByRole('checkbox', { name: 'Hindi' })
      fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
      expect(await screen.findByText('Select at least one language.')).toBeInTheDocument()
      expect(updateSite).not.toHaveBeenCalled()
    })
  })

  describe('language list states', () => {
    it('shows a loading message while languages load', () => {
      vi.mocked(getLanguages).mockReturnValueOnce(new Promise(() => {}))
      renderWithProviders(<LocalizeAddScreen />)
      expect(screen.getByText('Loading available languages…')).toBeInTheDocument()
    })

    it('shows an error message when languages fail to load', async () => {
      vi.mocked(getLanguages).mockRejectedValueOnce(new Error('network down'))
      renderWithProviders(<LocalizeAddScreen />)
      expect(await screen.findByText('Unable to load languages. Please try again.')).toBeInTheDocument()
      expect(screen.getByText('network down')).toBeInTheDocument()
    })

    it('shows an empty message when no languages are available', async () => {
      vi.mocked(getLanguages).mockResolvedValueOnce([])
      renderWithProviders(<LocalizeAddScreen />)
      expect(
        await screen.findByText('No languages are currently available. Please contact support.'),
      ).toBeInTheDocument()
    })
  })
})
