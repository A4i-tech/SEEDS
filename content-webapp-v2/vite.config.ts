import react from '@vitejs/plugin-react'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
    // Playwright e2e (*.spec.ts) live under tests/e2e — unit runs must never
    // pick them up (no jsdom API mocks, needs a real backend + browser).
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
})
