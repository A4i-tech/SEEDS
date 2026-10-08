import { RouterProvider } from '@tanstack/react-router';
import { router } from '@app/navigation/router';
import { AppProviders } from '@app/providers/AppProviders';

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
