import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { deleteSite, getSite, listSites } from '@features/localize/api/sites'
import { getLanguages } from '@shared/services/languages'
import { LocalizeSitesScreen } from '@features/localize/screens/LocalizeSitesScreen'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))

const site = {
  id: 's1',
  site_id: 'site-1',
  domain: 'a.com',
  name: '',
  status: 'Active',
  languages: [{ code: 'hi', enabled: true }],
  api_base: '',
  updated_at: '',
}

describe('LocalizeSitesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(getLanguages).mockResolvedValue([{ code: 'hi', name: 'Hindi' }])
  })

  it('shows a loading skeleton instead of a blank screen while sites load', () => {
    vi.mocked(listSites).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<LocalizeSitesScreen />)
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('lists the registered site after loading', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    expect(await screen.findByText('a.com')).toBeInTheDocument()
  })

  it('search filters sites by domain', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')

    fireEvent.change(screen.getByPlaceholderText('Search domain…'), {
      target: { value: 'zzz' },
    })

    expect(screen.queryByText('a.com')).not.toBeInTheDocument()
    expect(screen.getByText('No sites yet. Add a site to get started.')).toBeInTheDocument()
  })

  it('an empty registry shows the empty state', async () => {
    vi.mocked(listSites).mockResolvedValue([])
    renderWithProviders(<LocalizeSitesScreen />)
    expect(
      await screen.findByText('No sites yet. Add a site to get started.'),
    ).toBeInTheDocument()
  })

  it('a failed load surfaces the backend message', async () => {
    vi.mocked(listSites).mockRejectedValue(new Error('sites down'))
    renderWithProviders(<LocalizeSitesScreen />)
    expect(await screen.findByText('sites down')).toBeInTheDocument()
  })

  it('deletes a site after confirmation', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete site' }))
    await waitFor(() => expect(deleteSite).toHaveBeenCalled())
    expect(vi.mocked(deleteSite).mock.calls[0][0]).toBe('s1')
  })

  it("opens a site's SDK snippet, fetching api_base when the row lacks it", async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    vi.mocked(getSite).mockResolvedValue({ ...site, api_base: 'https://api.example.org' })
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')
    fireEvent.click(screen.getByRole('button', { name: 'View Snippet' }))
    expect(await screen.findByText(/data-site-id="site-1"/)).toBeInTheDocument()
    expect(getSite).toHaveBeenCalledWith('s1')
    expect(screen.getByText(/data-api-base="https:\/\/api.example.org"/)).toBeInTheDocument()
  })

  it('lists up to two languages comma separated, then +N more that opens the site', async () => {
    vi.mocked(getLanguages).mockResolvedValue([
      { code: 'hi', name: 'Hindi' },
      { code: 'kn', name: 'Kannada' },
      { code: 'ta', name: 'Tamil' },
      { code: 'te', name: 'Telugu' },
    ])
    vi.mocked(listSites).mockResolvedValue([
      { ...site, languages: ['hi', 'kn', 'ta', 'te'].map((code) => ({ code, enabled: true })) },
    ])
    renderWithProviders(<LocalizeSitesScreen />)
    const row = (await screen.findByText('a.com')).closest('tr') as HTMLElement
    expect(within(row).getByText(/Hindi, Kannada/)).toBeInTheDocument()
    expect(within(row).queryByText(/Tamil/)).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: '+2 more' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/localize/sites/$siteId/edit', params: { siteId: 's1' } })
  })

  it('still lists the sites when the languages call fails', async () => {
    vi.mocked(getLanguages).mockRejectedValue(new Error('Languages down'))
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)

    expect(await screen.findByText('a.com')).toBeInTheDocument()
    expect(await screen.findByText('Languages down')).toBeInTheDocument()
  })

  it('shows no +N more when there are two languages or fewer', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    const row = (await screen.findByText('a.com')).closest('tr') as HTMLElement
    expect(within(row).getByText('Hindi')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /more/ })).toBeNull()
  })

  it('has no Review translations button and shows dot-separated row actions', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')
    expect(screen.queryByRole('button', { name: 'Review translations' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-separator]')).toHaveLength(3)
    const container = screen.getByRole('button', { name: 'Open' }).parentElement as HTMLElement
    expect(container).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('Review navigates to the review screen with the site id', async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/localize/review', search: { siteId: 'site-1' } })
  })
})
