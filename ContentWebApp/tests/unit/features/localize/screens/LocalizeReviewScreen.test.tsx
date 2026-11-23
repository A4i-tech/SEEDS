import { Notifications } from '@mantine/notifications'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { listSites } from '@features/localize/api/sites'
import {
  approveTranslation,
  bulkApproveTranslations,
  listTranslations,
  updateTranslation,
} from '@features/localize/api/review'
import { createRule, deleteRule, listRules, updateRule } from '@features/localize/api/rules'
import { generateForReview } from '@features/localize/api/scripts'
import { getLanguages } from '@shared/services/languages'
import type { TranslationItem } from '@features/localize/types/localize.types'
import { ApiError } from '@shared/services/apiClient'
import { LocalizeReviewScreen } from '@features/localize/screens/LocalizeReviewScreen'

const search = vi.hoisted(() => ({ current: {} as { siteId?: string } }))

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/localize">{children}</a>,
}))

if (typeof document !== 'undefined' && !document.fonts) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { addEventListener: () => {}, removeEventListener: () => {} },
  })
}

vi.mock('@features/localize/api/sites', () => ({
  listSites: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))
vi.mock('@features/localize/api/review', () => ({
  listTranslations: vi.fn(),
  updateTranslation: vi.fn(),
  approveTranslation: vi.fn(),
  bulkApproveTranslations: vi.fn(),
}))
vi.mock('@features/localize/api/scripts', () => ({ generateForReview: vi.fn() }))
vi.mock('@features/localize/api/rules', () => ({
  listRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}))

const site = {
  id: 's1',
  site_id: 'site-1',
  domain: 'a.com',
  name: 'A',
  status: 'Active',
  languages: [{ code: 'kn', enabled: true }],
  api_base: '',
  updated_at: '',
}

function makeItem(key: string, sourceText: string, translated?: string, status = 'pending'): TranslationItem {
  return {
    id: key,
    key,
    route: '/about',
    source_text: sourceText,
    low_confidence: false,
    exclusion_rule_id: '',
    exclusion_pattern: '',
    shared: {},
    updated_at: '',
    translations: translated ? { kn: { text: translated, status } } : {},
  }
}

let items: TranslationItem[]

async function selectOption(inputPlaceholder: string, optionName: string) {
  fireEvent.mouseDown(await screen.findByPlaceholderText(inputPlaceholder))
  fireEvent.click(await screen.findByRole('option', { name: optionName, hidden: true }))
}

async function openReview() {
  renderWithProviders(
    <>
      <Notifications />
      <LocalizeReviewScreen />
    </>,
  )
  await selectOption('Select site', 'A')
  await waitFor(() => expect(screen.getByPlaceholderText('Pick a page')).toHaveValue('/about'))
  await selectOption('Select language', 'Kannada')
}

const confirmApproveAll = async () => {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Approve all' }))
}

describe('LocalizeReviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    search.current = {}
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(listSites).mockResolvedValue([site])
    vi.mocked(getLanguages).mockResolvedValue([{ code: 'kn', name: 'Kannada' }])
    items = [
      makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್'),
      makeItem('k2', 'Good Morning', 'ಶುಭೋದಯ'),
    ]
    vi.mocked(listTranslations).mockImplementation(async () => items)
    vi.mocked(generateForReview).mockResolvedValue(undefined)
    vi.mocked(listRules).mockResolvedValue([])
    vi.mocked(approveTranslation).mockResolvedValue(makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್', 'approved'))
    vi.mocked(updateTranslation).mockResolvedValue(makeItem('k1', 'Hello World', 'Edited text'))
    vi.mocked(bulkApproveTranslations).mockResolvedValue({ approved: 2 })
  })

  it('preselects the site from the siteId search param', async () => {
    search.current = { siteId: 'site-1' }
    renderWithProviders(<LocalizeReviewScreen />)
    expect(await screen.findByDisplayValue('A')).toBeInTheDocument()
  })

  it('search filters rows by source or translation text', async () => {
    await openReview()
    await screen.findByText('Hello World')
    expect(screen.getByText('Good Morning')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search source or translated text...'), {
      target: { value: 'Morning' },
    })

    expect(screen.queryByText('Hello World')).not.toBeInTheDocument()
    expect(screen.getByText('Good Morning')).toBeInTheDocument()
  })

  it('approve calls approveTranslation and shows the confirmation', async () => {
    await openReview()
    await screen.findByText('Hello World')

    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])

    await waitFor(() =>
      expect(approveTranslation).toHaveBeenCalledWith('k1', { lang: 'kn' }),
    )
    expect(await screen.findByText('Approved.')).toBeInTheDocument()
  })

  it('approve all uses the bulk endpoint and shows its count', async () => {
    await openReview()
    await screen.findByText('Hello World')

    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    await confirmApproveAll()

    await waitFor(() =>
      expect(bulkApproveTranslations).toHaveBeenCalledWith('site-1', {
        route: '/about',
        lang: 'kn',
      }),
    )
    expect(approveTranslation).not.toHaveBeenCalled()
    expect(await screen.findByText('Approved 2.')).toBeInTheDocument()
  })

  it('approve all on the Pending tab approves only the visible rows with text, one by one', async () => {
    items = [
      makeItem('k1', 'Hello World', 'ಹಲೋ'),
      makeItem('k2', 'Good Morning', 'ಶುಭೋದಯ', 'approved'),
      makeItem('k3', 'No text yet'),
    ]
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('tab', { name: /^Pending/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    await confirmApproveAll()

    await waitFor(() => expect(approveTranslation).toHaveBeenCalledWith('k1', { lang: 'kn' }))
    expect(approveTranslation).toHaveBeenCalledTimes(1)
    expect(bulkApproveTranslations).not.toHaveBeenCalled()
    expect(await screen.findByText('Approved 1.')).toBeInTheDocument()
  })

  it('approve all with a search approves only the matching rows', async () => {
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.change(screen.getByPlaceholderText('Search source or translated text...'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    await confirmApproveAll()

    await waitFor(() => expect(approveTranslation).toHaveBeenCalledWith('k1', { lang: 'kn' }))
    expect(approveTranslation).toHaveBeenCalledTimes(1)
    expect(bulkApproveTranslations).not.toHaveBeenCalled()
  })

  it('approve all reports skipped and failed counts from the bulk endpoint', async () => {
    vi.mocked(bulkApproveTranslations).mockResolvedValue({ approved: 1, skipped: 2, failed: 3 })
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    await confirmApproveAll()

    expect(await screen.findByText('Approved 1, skipped 2, 3 failed.')).toBeInTheDocument()
  })

  it('approve all says so when nothing is left to approve', async () => {
    items = [makeItem('k1', 'Hello World', 'ಹಲೋ', 'approved')]
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('tab', { name: /^Pending/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))

    expect(await screen.findByText('Nothing to approve.')).toBeInTheDocument()
    expect(bulkApproveTranslations).not.toHaveBeenCalled()
  })

  it('approve all asks for confirmation first and does nothing when cancelled', async () => {
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Approve all translations?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bulkApproveTranslations).not.toHaveBeenCalled()
    expect(approveTranslation).not.toHaveBeenCalled()
  })

  it('edit translation commits on blur via updateTranslation', async () => {
    await openReview()
    await screen.findByText('Hello World')

    const textarea = screen.getAllByLabelText('Translation')[0]
    fireEvent.change(textarea, { target: { value: 'Edited text' } })
    fireEvent.blur(textarea)

    await waitFor(() =>
      expect(updateTranslation).toHaveBeenCalledWith('k1', { lang: 'kn', text: 'Edited text' }),
    )
  })

  it('pagination slices rows to ten per page', async () => {
    items = Array.from({ length: 15 }, (_, i) => makeItem(`k${i}`, `Source ${i}`, `T${i}`))
    await openReview()
    await screen.findByText('Source 0')

    expect(screen.getByText('Source 9')).toBeInTheDocument()
    expect(screen.queryByText('Source 10')).not.toBeInTheDocument()
    expect(screen.getByText('1–10 of 15')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Source 10')).toBeInTheDocument()
    expect(screen.queryByText('Source 0')).not.toBeInTheDocument()
  })

  it('opens on All so approved and pending rows show without picking a tab', async () => {
    items = [makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್', 'approved'), makeItem('k2', 'Bye', 'ವಿದಾಯ')]
    await openReview()

    expect(await screen.findByText('Hello World')).toBeInTheDocument()
    expect(screen.getByText('Bye')).toBeInTheDocument()
  })

  it('an approved segment is hidden by the Pending tab', async () => {
    items = [makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್', 'approved')]
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('tab', { name: /^Pending/ }))

    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Hello World')).not.toBeInTheDocument()
  })

  it('lists the site pages without a route and selects the first one', async () => {
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), { ...makeItem('k2', 'Price', 'ಬೆಲೆ'), route: '/pricing' }]
    await openReview()

    expect(listTranslations).toHaveBeenCalledWith('site-1')
    expect(listTranslations).toHaveBeenCalledWith('site-1', '/about')
    await selectOption('Pick a page', '/pricing')
    await waitFor(() => expect(listTranslations).toHaveBeenCalledWith('site-1', '/pricing'))
  })

  it('remembers the site, page and language between visits', async () => {
    window.localStorage.setItem('seeds-localize-scope', JSON.stringify({ siteId: 'site-1', route: '/pricing', lang: 'kn' }))
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), { ...makeItem('k2', 'Price', 'ಬೆಲೆ'), route: '/pricing' }]
    renderWithProviders(<LocalizeReviewScreen />)

    await waitFor(() => expect(listTranslations).toHaveBeenCalledWith('site-1', '/pricing'))
    expect(screen.getByPlaceholderText('Select language')).toHaveValue('Kannada')
  })

  it('stores the chosen site, page and language', async () => {
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), { ...makeItem('k2', 'Price', 'ಬೆಲೆ'), route: '/pricing' }]
    await openReview()
    await selectOption('Pick a page', '/pricing')

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('seeds-localize-scope') ?? '{}')).toEqual({
        siteId: 'site-1',
        route: '/pricing',
        lang: 'kn',
      }),
    )
  })

  it('opens the page and language from the link before the remembered ones', async () => {
    window.localStorage.setItem('seeds-localize-scope', JSON.stringify({ siteId: 'site-1', route: '/about', lang: 'kn' }))
    search.current = { siteId: 'site-1', route: '/pricing', lang: 'kn' }
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), { ...makeItem('k2', 'Price', 'ಬೆಲೆ'), route: '/pricing' }]
    renderWithProviders(<LocalizeReviewScreen />)

    await waitFor(() => expect(listTranslations).toHaveBeenCalledWith('site-1', '/pricing'))
  })

  it('shows a loading message while the sites load', () => {
    vi.mocked(listSites).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<LocalizeReviewScreen />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Select site')).toBeNull()
  })

  it('asks to pick a site when none are registered', async () => {
    vi.mocked(listSites).mockResolvedValue([])
    renderWithProviders(<LocalizeReviewScreen />)

    expect(await screen.findByText('Pick a site above to start reviewing its translations.')).toBeInTheDocument()
    expect(listTranslations).not.toHaveBeenCalled()
  })

  it('falls back to the first site and its first language when nothing is remembered', async () => {
    renderWithProviders(<LocalizeReviewScreen />)

    expect(await screen.findByDisplayValue('A')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByPlaceholderText('Select language')).toHaveValue('Kannada'))
  })

  it('shows Localize and the site name as breadcrumbs', async () => {
    await openReview()

    expect(screen.getByRole('link', { name: 'Localize' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('A')).toBeInTheDocument()
  })

  it('shows the pending, approved and all counts on the tabs', async () => {
    items = [
      makeItem('k1', 'Hello', 'ಹಲೋ'),
      makeItem('k2', 'Bye', 'ವಿದಾಯ', 'approved'),
      makeItem('k3', 'Yes', 'ಹೌದು', 'approved'),
    ]
    await openReview()

    expect(await screen.findByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Approved (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All (3)' })).toBeInTheDocument()
  })

  it('generates missing translations once when the page opens', async () => {
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), makeItem('k2', 'Bye')]
    await openReview()

    await waitFor(() => expect(generateForReview).toHaveBeenCalledWith('site-1', '/about', 'kn'))
    expect(generateForReview).toHaveBeenCalledTimes(1)
  })

  it('shows the generated text in the translation box once generation finishes', async () => {
    items = [makeItem('k1', 'Hello', 'ಹಲೋ'), makeItem('k2', 'Bye')]
    vi.mocked(generateForReview).mockImplementation(async () => {
      items = [makeItem('k1', 'Hello', 'ಹಲೋ'), makeItem('k2', 'Bye', 'ವಿದಾಯ')]
    })
    await openReview()

    expect(await screen.findByDisplayValue('ವಿದಾಯ')).toBeInTheDocument()
  })

  it('does not generate when every translation exists', async () => {
    await openReview()
    await screen.findByText('Hello World')

    expect(generateForReview).not.toHaveBeenCalled()
  })

  it('a site without translations has no page to pick', async () => {
    items = []
    renderWithProviders(<LocalizeReviewScreen />)
    await selectOption('Select site', 'A')

    await waitFor(() => expect(listTranslations).toHaveBeenCalledWith('site-1'))
    expect(screen.getByPlaceholderText('Pick a page')).toHaveValue('')
    expect(listTranslations).not.toHaveBeenCalledWith('site-1', expect.anything())
  })

  it('opens the most recently updated page first', async () => {
    items = [
      { ...makeItem('k1', 'Hello', 'ಹಲೋ'), route: '/old', updated_at: '2026-01-01T00:00:00' },
      { ...makeItem('k2', 'Price', 'ಬೆಲೆ'), route: '/new', updated_at: '2026-06-01T00:00:00' },
    ]
    renderWithProviders(<LocalizeReviewScreen />)
    await selectOption('Select site', 'A')

    await waitFor(() => expect(listTranslations).toHaveBeenCalledWith('site-1', '/new'))
    expect(listTranslations).not.toHaveBeenCalledWith('site-1', '/old')
  })

  it('shows a permission message when the backend answers 403', async () => {
    vi.mocked(listTranslations).mockRejectedValue(new ApiError(403, 'Forbidden'))
    renderWithProviders(<LocalizeReviewScreen />)
    await selectOption('Select site', 'A')

    expect(await screen.findByText("Your account doesn't have access to Translate & Review.")).toBeInTheDocument()
  })

  it('approving a row reloads the list so shared and excluded state stay correct', async () => {
    items = [makeItem('k1', 'Hello World', 'ಹಲೋ')]
    vi.mocked(approveTranslation).mockImplementation(async () => {
      items = [makeItem('k1', 'Hello World', 'ಹಲೋ', 'approved')]
      return items[0]
    })
    await openReview()
    await screen.findByText('Hello World')
    const calls = vi.mocked(listTranslations).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('tab', { name: 'Approved (1)' })).toBeInTheDocument()
    expect(vi.mocked(listTranslations).mock.calls.length).toBeGreaterThan(calls)
  })

  it('a failed load surfaces the backend message', async () => {
    vi.mocked(listTranslations).mockRejectedValue(new Error('Network error'))
    renderWithProviders(<LocalizeReviewScreen />)
    await selectOption('Select site', 'A')

    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })
  it('shows the pending, approved, all and excluded counts on the tabs', async () => {
    items = [
      makeItem('k1', 'Hello', 'ಹಲೋ', 'approved'),
      makeItem('k2', 'Bye', 'ವಿದಾಯ'),
      { ...makeItem('k3', 'x = 1', 'x = 1'), exclusion_rule_id: 'r1', exclusion_pattern: 'x = *' },
    ]
    await openReview()
    await screen.findByText('Hello')

    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Approved (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Excluded (1)' })).toBeInTheDocument()
  })

  it('excluded rows are only on the Excluded tab, with their pattern and no actions', async () => {
    items = [
      makeItem('k1', 'Hello', 'ಹಲೋ'),
      { ...makeItem('k2', 'x = 1', 'old'), exclusion_rule_id: 'r1', exclusion_pattern: 'x = *' },
    ]
    await openReview()
    await screen.findByText('Hello')
    expect(screen.queryByText('x = 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /^Excluded/ }))

    expect(await screen.findByText('x = *')).toBeInTheDocument()
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Translation')).toHaveValue('x = 1')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply to all pages' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Translation')).toBeDisabled()
  })

  it('approve all never sends excluded rows', async () => {
    items = [
      makeItem('k1', 'Hello', 'ಹಲೋ'),
      { ...makeItem('k2', 'x = 1', 'old'), exclusion_rule_id: 'r1', exclusion_pattern: 'x = *' },
    ]
    await openReview()
    await screen.findByText('Hello')
    fireEvent.click(screen.getByRole('tab', { name: /^Pending/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    await confirmApproveAll()

    await waitFor(() => expect(approveTranslation).toHaveBeenCalledWith('k1', { lang: 'kn' }))
    expect(approveTranslation).toHaveBeenCalledTimes(1)
  })

  it('a shared row sits on the Overridden tab with the override text and no actions', async () => {
    items = [{ ...makeItem('k1', 'Dates', ''), shared: { kn: { rule_id: 'r1', translation: 'ತಾರೀಖು' } } }]
    await openReview()
    fireEvent.click(await screen.findByRole('tab', { name: 'Overridden (1)' }))

    expect(await screen.findByDisplayValue('ತಾರೀಖು')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('the Rules modal lists, adds, edits and deletes rules', async () => {
    const rule = { id: 'r1', kind: 'exclusion' as const, text: 'x = *', lang: '', translation: '', updated_at: '', updated_by: '' }
    vi.mocked(listRules).mockResolvedValue([rule])
    vi.mocked(createRule).mockResolvedValue(rule)
    vi.mocked(updateRule).mockResolvedValue(rule)
    vi.mocked(deleteRule).mockResolvedValue(undefined)
    await openReview()
    await screen.findByText('Hello World')

    fireEvent.click(screen.getByRole('button', { name: 'Rules' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('x = *')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Text or pattern'), { target: { value: 'a?c' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith('site-1', { kind: 'exclusion', text: 'a?c', lang: '', translation: '' }),
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(dialog).getByLabelText('Text or pattern'), { target: { value: 'x = ?' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith('r1', { kind: 'exclusion', text: 'x = ?', lang: '', translation: '' }),
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete rule' }))
    const confirm = (await screen.findByText('Delete this rule?')).closest('section') as HTMLElement
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete rule' }))
    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith('r1', expect.anything()))
  })

  it('an override rule needs a language and a translation before it can be saved', async () => {
    await openReview()
    await screen.findByText('Hello World')
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Overrides' }))
    fireEvent.change(within(dialog).getByLabelText('Source text'), { target: { value: 'Dates' } })

    expect(within(dialog).getByRole('button', { name: 'Save rule' })).toBeDisabled()
  })
})

