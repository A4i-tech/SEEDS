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
import { generateForReview } from '@features/localize/api/scripts'
import { getLanguages } from '@shared/services/languages'
import type { TranslationItem } from '@features/localize/types/localize.types'
import { LocalizeReviewScreen } from '@features/localize/screens/LocalizeReviewScreen'

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
    translations: translated ? { kn: { text: translated, status } } : {},
  }
}

let items: TranslationItem[]

async function selectOption(inputPlaceholder: string, optionName: string) {
  fireEvent.mouseDown(screen.getByPlaceholderText(inputPlaceholder))
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
  fireEvent.change(screen.getByPlaceholderText('Page route, e.g. /pricing'), {
    target: { value: '/about' },
  })
  await selectOption('Select language', 'Kannada')
}

describe('LocalizeReviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
    vi.mocked(listSites).mockResolvedValue([site])
    vi.mocked(getLanguages).mockResolvedValue([{ code: 'kn', name: 'Kannada' }])
    items = [
      makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್'),
      makeItem('k2', 'Good Morning', 'ಶುಭೋದಯ'),
    ]
    vi.mocked(listTranslations).mockImplementation(async () => items)
    vi.mocked(generateForReview).mockResolvedValue(undefined)
    vi.mocked(approveTranslation).mockResolvedValue(makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್', 'approved'))
    vi.mocked(updateTranslation).mockResolvedValue(makeItem('k1', 'Hello World', 'Edited text'))
    vi.mocked(bulkApproveTranslations).mockResolvedValue({ approved: 2 })
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

    await waitFor(() =>
      expect(bulkApproveTranslations).toHaveBeenCalledWith('s1', {
        route: '/about',
        lang: 'kn',
      }),
    )
    expect(approveTranslation).not.toHaveBeenCalled()
    expect(await screen.findByText('Approved 2.')).toBeInTheDocument()
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

  it('generate requests translations for the selected page', async () => {
    await openReview()
    await screen.findByText('Hello World')

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() =>
      expect(generateForReview).toHaveBeenCalledWith('s1', '/about', 'kn'),
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

  it('an approved segment is hidden by the default pending stage filter', async () => {
    items = [makeItem('k1', 'Hello World', 'ಹಲೋ ವರ್ಲ್ಡ್', 'approved')]
    await openReview()
    await screen.findByText('Nothing here yet.')

    expect(within(screen.getByRole('table')).queryByText('Hello World')).not.toBeInTheDocument()
  })

  it('an empty page shows the generate hint, not an error', async () => {
    items = []
    await openReview()

    expect(
      await screen.findByText('No translations yet for this page. Generate to create them for review.'),
    ).toBeInTheDocument()
  })

  it('a failed load surfaces the backend message', async () => {
    vi.mocked(listTranslations).mockRejectedValue(new Error('Network error'))
    await openReview()

    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })
})

