import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test-utils/renderWithProviders'
import { AccountProfileScreen } from '@features/account/screens/AccountProfileScreen'
import { useAuthStore } from '@features/auth/store/useAuthStore'
import { apiClient } from '@shared/services/apiClient'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@shared/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/apiClient')>()),
  apiClient: { get: vi.fn() },
}))

const payloads = {
  tenant: { name: 'Asha Rao', email: 'asha@x.org', phone_number: '123', tenant_name: 'Acme Tenant' },
  school_admin: { name: 'Sam Admin', email: 'sam@x.org', phone_number: '456', organisation: 'Green School' },
  content_creator: { name: 'Cleo Creator', email: 'cleo@x.org', phone_number: '789' },
}

describe('AccountProfileScreen', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
  })

  it('shows the tenant line for a tenant', async () => {
    useAuthStore.setState({ status: 'authenticated', role: 'tenant', schoolId: '' })
    vi.mocked(apiClient.get).mockResolvedValue({ data: payloads.tenant })
    renderWithProviders(<AccountProfileScreen />)
    expect(await screen.findByText('Name: Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('Tenant: Acme Tenant')).toBeInTheDocument()
  })

  it('shows the organisation and hides the tenant line for a school admin', async () => {
    useAuthStore.setState({ status: 'authenticated', role: 'school_admin', schoolId: '' })
    vi.mocked(apiClient.get).mockResolvedValue({ data: payloads.school_admin })
    renderWithProviders(<AccountProfileScreen />)
    expect(await screen.findByText('Name: Sam Admin')).toBeInTheDocument()
    expect(screen.getByText('Organisation: Green School')).toBeInTheDocument()
    expect(screen.queryByText(/Tenant:/)).not.toBeInTheDocument()
  })

  it('renders a content creator profile without a tenant line', async () => {
    useAuthStore.setState({ status: 'authenticated', role: 'content_creator', schoolId: '' })
    vi.mocked(apiClient.get).mockResolvedValue({ data: payloads.content_creator })
    renderWithProviders(<AccountProfileScreen />)
    expect(await screen.findByText('Name: Cleo Creator')).toBeInTheDocument()
    expect(screen.queryByText(/Tenant:/)).not.toBeInTheDocument()
  })

  it('shows a readable message and logs the real error when loading fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ status: 'authenticated', role: 'content_creator', schoolId: '' })
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom detail'))
    renderWithProviders(<AccountProfileScreen />)
    expect(await screen.findByText('Could not load this. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('boom detail')).not.toBeInTheDocument()
    expect(logged).toHaveBeenCalledWith('Error: boom detail')
    logged.mockRestore()
  })
})
