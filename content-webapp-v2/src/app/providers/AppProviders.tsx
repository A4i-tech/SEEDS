import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import '@app/theme/seeds.css';
import '@shared/i18n';
import { queryClient } from '@app/store/queryClient';
import { seedsTheme } from '@app/theme/seedsTheme';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={seedsTheme} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
