import { act, waitFor } from '@testing-library/react'
import { notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@shared/i18n'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { useRemediationUpload } from '../../../../../src/features/make-accessible/hooks/useRemediationUpload'
import { createRemediationJob } from '@features/make-accessible/api/remediation'
import { getLanguages } from '@shared/services/languages'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@features/make-accessible/api/remediation', () => ({ createRemediationJob: vi.fn() }))
vi.mock('@shared/services/languages', () => ({ getLanguages: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ status: 'authenticated' })
  vi.mocked(getLanguages).mockResolvedValue([{ code: 'ta', name: 'Tamil' }])
})

describe('useRemediationUpload', () => {
  it('uploads the file, notifies and navigates to the jobs list', async () => {
    vi.mocked(createRemediationJob).mockResolvedValue('job-new')
    const { result } = renderHookWithProviders(() => useRemediationUpload())
    const file = new File(['%PDF-'], 'new.pdf')

    await act(async () => {
      await result.current.upload({ file, targetLanguage: 'ta' })
    })

    expect(vi.mocked(createRemediationJob).mock.calls[0].slice(0, 2)).toEqual([file, 'ta'])
    expect(notifications.show).toHaveBeenCalledWith({
      message: i18n.t('makeAccessible.uploaded', { name: 'new.pdf' }),
    })
    expect(navigate).toHaveBeenCalledWith({ to: '/jobs' })
  })

  it('surfaces a failed upload rather than silently doing nothing', async () => {
    vi.mocked(createRemediationJob).mockRejectedValue(new Error('PDF is larger than 200 MB'))
    const { result } = renderHookWithProviders(() => useRemediationUpload())

    await act(async () => {
      await expect(
        result.current.upload({ file: new File(['x'], 'big.pdf'), targetLanguage: 'en' }),
      ).rejects.toThrow('PDF is larger than 200 MB')
    })

    expect(notifications.show).toHaveBeenCalledWith({ color: 'red', message: 'PDF is larger than 200 MB' })
    expect(navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.isUploading).toBe(false))
  })

  it('exposes the language options', async () => {
    const { result } = renderHookWithProviders(() => useRemediationUpload())
    await waitFor(() => expect(result.current.languageOptions).toEqual([{ value: 'ta', label: 'Tamil' }]))
  })
})

