import { waitFor, act } from '@testing-library/react'
import { notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@shared/i18n'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { useLocalizeSites } from '../../../../../src/features/localize/hooks/useLocalizeSites'
import { createSite, deleteSite, listSites, updateSite } from '@features/localize/api/sites'
import { getLanguages } from '@shared/services/languages'
import type { Website, WebsiteFields } from '@features/localize/types/localize.types'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

const site: Website = {
  id: 's1',
  site_id: 'site-1',
  domain: 'a.com',
  name: 'A',
  status: 'Active',
  languages: [],
  api_base: '',
  updated_at: '',
}
const language = { code: 'hi', name: 'Hindi' }
const fields: WebsiteFields = { domain: 'b.com', name: 'B', status: 'Active', languages: [] }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated' })
  vi.mocked(listSites).mockResolvedValue([site])
  vi.mocked(getLanguages).mockResolvedValue([language])
})

const loaded = async () => {
  const hook = renderHookWithProviders(() => useLocalizeSites())
  await waitFor(() => expect(hook.result.current.state.status).not.toBe('loading'))
  return hook
}

describe('useLocalizeSites', () => {
  it('starts loading with empty collections', () => {
    const { result } = renderHookWithProviders(() => useLocalizeSites())
    expect(result.current.state.status).toBe('loading')
    expect(result.current.sites).toEqual([])
    expect(result.current.languages).toEqual([])
  })

  it('loads sites and languages', async () => {
    const { result } = await loaded()
    expect(result.current.state.status).toBe('done')
    expect(result.current.sites).toEqual([site])
    expect(result.current.languages).toEqual([language])
  })

  it('a failed site load keeps the languages and reports the error', async () => {
    vi.mocked(listSites).mockRejectedValue(new Error('sites down'))
    const { result } = await loaded()
    expect(result.current.sites).toEqual([])
    await waitFor(() => expect(result.current.languages).toEqual([language]))
    expect(result.current.state).toEqual({ status: 'error', error: new Error('sites down') })
  })

  it('a failed language load reports the error', async () => {
    vi.mocked(getLanguages).mockRejectedValue(new Error('langs down'))
    const { result } = await loaded()
    expect(result.current.languages).toEqual([])
    expect(result.current.state).toEqual({ status: 'error', error: new Error('langs down') })
  })

  it('create sends the fields and shows the created site after refetch', async () => {
    const created = { ...site, id: 's2', site_id: 'site-2', domain: 'b.com' }
    vi.mocked(createSite).mockResolvedValue(created)
    const { result } = await loaded()
    vi.mocked(listSites).mockResolvedValue([site, created])
    act(() => result.current.create(fields))
    await waitFor(() => expect(result.current.sites).toEqual([site, created]))
    expect(vi.mocked(createSite).mock.calls[0][0]).toEqual(fields)
    expect(notifications.show).toHaveBeenCalledWith({ message: i18n.t('localize.siteCreated') })
  })

  it('update replaces only the matching site', async () => {
    const other = { ...site, id: 's2', site_id: 'site-2', domain: 'b.com' }
    vi.mocked(listSites).mockResolvedValue([site, other])
    const updated = { ...site, name: 'Renamed' }
    vi.mocked(updateSite).mockResolvedValue(updated)
    const { result } = await loaded()
    vi.mocked(listSites).mockResolvedValue([updated, other])
    act(() => result.current.update({ id: 's1', fields }))
    await waitFor(() => expect(result.current.sites).toEqual([updated, other]))
    expect(vi.mocked(updateSite).mock.calls[0].slice(0, 2)).toEqual(['s1', fields])
    expect(notifications.show).toHaveBeenCalledWith({ message: i18n.t('localize.siteUpdated') })
  })

  it('remove drops the site after the API call succeeds', async () => {
    vi.mocked(deleteSite).mockResolvedValue(undefined)
    const { result } = await loaded()
    vi.mocked(listSites).mockResolvedValue([])
    act(() => result.current.remove('s1'))
    await waitFor(() => expect(result.current.sites).toEqual([]))
    expect(vi.mocked(deleteSite).mock.calls[0][0]).toBe('s1')
    expect(notifications.show).toHaveBeenCalledWith({ message: i18n.t('localize.siteDeleted') })
  })

  it('a failed delete leaves the list unchanged and surfaces the error', async () => {
    vi.mocked(deleteSite).mockRejectedValue(new Error('nope'))
    const { result } = await loaded()
    act(() => result.current.remove('s1'))
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({ color: 'red', message: 'nope' }),
    )
    expect(result.current.sites).toEqual([site])
    expect(listSites).toHaveBeenCalledTimes(1)
  })
})

