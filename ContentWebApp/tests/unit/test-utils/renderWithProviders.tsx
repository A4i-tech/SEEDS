import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import '@shared/i18n'
import { seedsTheme } from '@app/theme/seedsTheme'

 function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MantineProvider theme={seedsTheme}>
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    )
  }
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: createWrapper() })
}

export function renderHookWithProviders<T>(hook: () => T) {
  return renderHook(hook, { wrapper: createWrapper() })
}
