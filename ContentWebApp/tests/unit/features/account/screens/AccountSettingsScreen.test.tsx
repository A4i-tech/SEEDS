import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { AccountSettingsScreen } from '@features/account/screens/AccountSettingsScreen'

const setColorScheme = vi.hoisted(() => vi.fn())

vi.mock('@mantine/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mantine/core')>()),
  useMantineColorScheme: () => ({ setColorScheme }),
  useComputedColorScheme: () => 'light',
}))

describe('AccountSettingsScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', role: 'tenant', schoolId: '' })
  })


  it('switches to high contrast, sets data-contrast on <html> and persists it', async () => {
    renderWithProviders(<AccountSettingsScreen />)
    fireEvent.click(screen.getByLabelText('High contrast'))
    await waitFor(() => expect(document.documentElement.dataset.contrast).toBe('high'))
    expect(localStorage.getItem('seeds-contrast')).toBe('"high"')
    fireEvent.click(screen.getByLabelText('Standard'))
    await waitFor(() => expect(document.documentElement.dataset.contrast).toBe('standard'))
  })

  it('switches the colour scheme from the Light/Dark control', () => {
    renderWithProviders(<AccountSettingsScreen />)
    fireEvent.click(screen.getByLabelText('Dark'))
    expect(setColorScheme).toHaveBeenCalledWith('dark')
  })
})
