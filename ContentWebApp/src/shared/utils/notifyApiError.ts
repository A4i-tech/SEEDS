import { notifications } from '@mantine/notifications';

export function notifyApiError(error: Error) {
  if (error.message) notifications.show({ color: 'red', message: error.message });
}
