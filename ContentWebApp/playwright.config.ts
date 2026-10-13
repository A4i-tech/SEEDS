import { defineConfig, devices } from '@playwright/test';
import { authFile, getInstance } from './tests/e2e/fixtures/instances';

const instanceName = process.env.E2E_INSTANCE || 'local';
const instance = getInstance(instanceName);

export default defineConfig({
  testDir: './tests/e2e',
  // 60s budget mirrors legacy: authenticated flows fan out into real API calls
  // (login, /tenant/me, library/jobs loads) and must not be cut short by the
  // 30s default before their own waitForURL/auto-retry assertions resolve.
  timeout: 60000,
  // Originally forced to 1 because auth.spec.js's password-change tests mutated
  // the shared tenant persona mid-run — test.describe.configure({ mode: 'serial'
  // }) inside a file only serializes that file's own tests, not a different file
  // running concurrently in another worker, and school specs logging in as
  // tenant were confirmed live to race that mutation window and fail
  // nondeterministically. That race is fixed the same way as legacy:
  // TC-AUTH-007/008 use a dedicated PERSONAS.tenantPasswordTest no other spec
  // touches (see tests/e2e/fixtures/instances.ts). workers: 1 is kept for now
  // pending a dedicated pass to confirm no other cross-file race depends on it
  // before reintroducing parallelism.
  workers: 1,
  use: {
    baseURL: instance.baseURL,
    headless: true,
    screenshot: 'on',
    video: 'off',
  },
  // Only spin up a local dev server when testing against localhost; the dev
  // instance is already running and reachable directly.
  // v2 serves via `vite` (default port 5173), not CRA's `npm start` (:3000).
  webServer:
    instanceName === 'local'
      ? {
          command: 'npm run dev',
          url: instance.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        }
      : undefined,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e-results.json' }], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testDir: './tests/e2e/tests',
      testIgnore: /authenticated\//,
    },
    {
      // Depends on 'chromium' so it always runs after auth.spec.ts's password-change
      // tests restore the tenantPasswordTest persona's password — see auth.spec.ts.
      name: 'setup',
      testMatch: /tests\/e2e\/auth\/auth\.setup\.ts/,
      dependencies: ['chromium'],
    },
    {
      name: 'chromium-tenant-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('tenant') },
      testDir: './tests/e2e/tests/authenticated',
      testIgnore: /school\//,
      dependencies: ['setup'],
    },
    {
      name: 'chromium-school-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('school') },
      testDir: './tests/e2e/tests/authenticated',
      testIgnore: /tenant\//,
      dependencies: ['setup'],
    },
  ],
});
