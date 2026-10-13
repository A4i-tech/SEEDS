import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { CreateUploadScreen } from '@features/create/screens/CreateUploadScreen'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@shared/services/languages', () => ({
  getLanguages: vi.fn().mockResolvedValue([{ code: 'en', name: 'English' }]),
}))

const mutate = vi.fn()

vi.mock('@features/create/hooks/useCreateContent', () => ({
  useCreateContentAudio: () => ({ mutate, isPending: false }),
}))

vi.mock('@shared/components/ConfirmDialog', () => ({
  openConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => onConfirm(),
}))

async function selectOption(comboboxName: string, optionName: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: comboboxName }))
  fireEvent.click(await screen.findByRole('option', { name: optionName, hidden: true }))
}

function fillValidForm({ fileName = 'clip.mp3', mime = 'audio/mpeg' }: { fileName?: string; mime?: string } = {}) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'River Song' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Theme' }), { target: { value: 'Nature' } })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['audio'], fileName, { type: mime })] } })
  return { input }
}

describe('CreateUploadScreen mp3 guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'authenticated', role: 'tenant' })
  })

  it('rejects a non-mp3 file with a field error and never uploads', async () => {
    renderWithProviders(<CreateUploadScreen />)
    await selectOption('Experience type', 'Story')
    await selectOption('Language', 'English')
    fillValidForm({ fileName: 'clip.wav', mime: 'audio/wav' })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))
    expect(await screen.findByText('Only .mp3 files are allowed.')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('accepts an .mp3 file (case-insensitive) and uploads after confirm', async () => {
    renderWithProviders(<CreateUploadScreen />)
    await selectOption('Experience type', 'Story')
    await selectOption('Language', 'English')
    fillValidForm({ fileName: 'Clip.MP3' })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].file.name).toBe('Clip.MP3')
  })
})
