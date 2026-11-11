import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { getContentSasUrl } from '@features/library/api/library'
import type { AudioContentItem } from '@features/library/types/content.types'
import { AudioPreview } from '@features/library/components/ContentPreview'

vi.mock('@features/library/api/library', () => ({
  getContentSasUrl: vi.fn(),
}))

function audioItem(audioUrl: string): AudioContentItem {
  return {
    id: 'a1',
    type: 'audio',
    is_processed: true,
    audio_content: [{ audio_url: audioUrl, description: '', duration_seconds: 0 }],
  } as AudioContentItem
}

describe('AudioPreview', () => {
  it('renders a Download link to the SAS url', async () => {
    vi.mocked(getContentSasUrl).mockResolvedValue('https://sas/a.mp3')
    renderWithProviders(<AudioPreview item={audioItem('a.mp3')} />)
    const link = await screen.findByRole('link', { name: 'Download' })
    expect(link).toHaveAttribute('href', 'https://sas/a.mp3')
    expect(link).toHaveAttribute('download')
  })

  it('renders no Download link without an audio url', () => {
    renderWithProviders(<AudioPreview item={audioItem('')} />)
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull()
  })
})
