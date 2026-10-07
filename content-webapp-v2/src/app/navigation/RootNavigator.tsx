import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

export function RootNavigator() {
  return <RouterProvider router={router} />;
}
