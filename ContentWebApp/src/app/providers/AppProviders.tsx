import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import 'katex/dist/katex.min.css';
import '@app/theme/seeds.css';
import '@shared/i18n';
import { queryClient } from '@app/store/queryClient';
import { seedsCssVariablesResolver } from '@app/theme/seedsPalette';
import { seedsTheme } from '@app/theme/seedsTheme';
import { useContrast } from '@app/theme/useContrast';

export function AppProviders({ children }: { children: ReactNode }) {
  useContrast();
  return (
    <MantineProvider theme={seedsTheme} cssVariablesResolver={seedsCssVariablesResolver} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
