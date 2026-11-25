import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const SDK_E2E_FIXTURE = path.resolve(__dirname, 'tests/e2e/fixtures/files/e2e-sdk-test-page.html')

function sdkE2eFixture(): Plugin {
  return {
    name: 'sdk-e2e-fixture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/e2e-sdk-test-page.html', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(fs.readFileSync(SDK_E2E_FIXTURE))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), sdkE2eFixture()],
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
    setupFiles: ['./tests/unit/setup.ts'],
    testTimeout: 30_000,
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
    },
  },
})
