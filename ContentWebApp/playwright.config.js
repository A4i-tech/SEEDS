// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { getInstance, authFile } = require('./e2e/fixtures/instances');

const instanceName = process.env.E2E_INSTANCE || 'local';
const instance = getInstance(instanceName);

module.exports = defineConfig({
  testDir: './e2e',
  // 90-120s poll waits in ContentListPage.waitUntilProcessed()/waitForRow()
  // need their own timeout budget — the previous 30s default cut them short
  // before their own internal timeout logic ever ran.
  timeout: 60000,
  // Originally forced to 1 because auth.spec.js's password-change tests mutated
  // the shared tenant persona mid-run — test.describe.configure({ mode: 'serial'
  // }) inside a file only serializes that file's own tests, not a different file
  // running concurrently in another worker, and school.spec.js's tenant login was
  // confirmed live to race that mutation window and fail nondeterministically.
  // That race is now fixed: auth.spec.js's password-change tests use a dedicated
  // PERSONAS.tenantPasswordTest no other spec touches (see fixtures/instances.js).
  // workers: 1 is kept for now pending a dedicated pass to confirm no other
  // cross-file race depends on it before reintroducing parallelism.
  workers: 1,
  use: {
    baseURL: instance.baseURL,
    headless: true,
    screenshot: 'on',
    video: 'off',
  },
  // Only spin up a local dev server when testing against localhost; remote
  // instances (onrender, dev) are already running and reachable directly.
  webServer:
    instanceName === 'local'
      ? {
          command: 'npm start',
          url: instance.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        }
      : undefined,
  reporter: [['list'], ['json', { outputFile: 'e2e-results.json' }], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testDir: './e2e/tests',
      testIgnore: /authenticated\//,
    },
    {
      // Depends on 'chromium' so it always runs after auth.spec.js's password-change
      // tests restore the tenant persona's password — see the note in auth.spec.js.
      name: 'setup',
      testMatch: /e2e\/auth\/auth\.setup\.js/,
      dependencies: ['chromium'],
    },
    {
      name: 'chromium-tenant-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('tenant') },
      testDir: './e2e/tests/authenticated',
      testIgnore: /school\//,
      dependencies: ['setup'],
    },
    {
      name: 'chromium-school-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('school') },
      testDir: './e2e/tests/authenticated',
      testIgnore: /tenant\//,
      dependencies: ['setup'],
    },
  ],
});
