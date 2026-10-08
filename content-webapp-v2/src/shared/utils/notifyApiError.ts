import { notifications } from '@mantine/notifications';
import { toApiErrorMessage } from './apiErrors';

export function notifyApiError(err: unknown) {
  const message = toApiErrorMessage(err);
  if (message) notifications.show({ color: 'red', message });
}
