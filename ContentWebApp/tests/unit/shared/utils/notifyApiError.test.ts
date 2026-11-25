import { describe, expect, it, vi } from 'vitest'

import { notifications } from '@mantine/notifications'
import { notifyApiError } from '../../../../src/shared/utils/notifyApiError'

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

describe('notifyApiError', () => {
  it('surfaces the error message as a red notification', () => {
    notifyApiError(new Error('boom'))
    expect(notifications.show).toHaveBeenCalledWith({ color: 'red', message: 'boom' })
  })

  it('stays silent when there is no message', () => {
    vi.mocked(notifications.show).mockClear()
    notifyApiError(new Error(''))
    expect(notifications.show).not.toHaveBeenCalled()
  })
})
