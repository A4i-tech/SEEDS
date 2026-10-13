import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { deleteSite, listSites } from '@features/localize/api/sites'
import { getLanguages } from '@shared/services/languages'
import { LocalizeSitesScreen } from '@features/localize/screens/LocalizeSitesScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn(),
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

  it("opens a site's SDK snippet", async () => {
    vi.mocked(listSites).mockResolvedValue([site])
    renderWithProviders(<LocalizeSitesScreen />)
    await screen.findByText('a.com')
    fireEvent.click(screen.getByRole('button', { name: 'View Snippet' }))
    expect(await screen.findByText(/data-site-id="site-1"/)).toBeInTheDocument()
  })
})

