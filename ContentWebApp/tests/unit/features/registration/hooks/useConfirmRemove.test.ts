import { notifications } from '@mantine/notifications'
import { describe, expect, it, vi } from 'vitest'

import { renderHookWithProviders } from '../../../test-utils/renderWithProviders'
import { openConfirmDialog } from '@shared/components/ConfirmDialog'
import { useConfirmRemove } from '@features/registration/hooks/useConfirmRemove'

vi.mock('@shared/components/ConfirmDialog', () => ({
  openConfirmDialog: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

const mockedDialog = vi.mocked(openConfirmDialog)

function confirmArgs() {
  expect(mockedDialog).toHaveBeenCalledTimes(1)
  return mockedDialog.mock.calls[0][0]
}

describe('useConfirmRemove', () => {
  it('asks for confirmation and removes on confirm', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHookWithProviders(() => useConfirmRemove())
    result.current('Delete Ravi?', 'Delete', remove)
    const args = confirmArgs()
    expect(args.title).toBe('Delete Ravi?')
    expect(args.confirmLabel).toBe('Delete')
    await args.onConfirm()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('notifies instead of throwing when removal fails', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('in use'))
    const { result } = renderHookWithProviders(() => useConfirmRemove())
    result.current('Delete Ravi?', 'Delete', remove)
    await confirmArgs().onConfirm()
    expect(vi.mocked(notifications.show)).toHaveBeenCalled()
  })
})
