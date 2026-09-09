// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { getInstance, authFile } = require('./e2e/fixtures/instances');

const instanceName = process.env.E2E_INSTANCE || 'local';
const instance = getInstance(instanceName);

module.exports = defineConfig({
  testDir: './e2e',
  // ContentListPage.waitUntilProcessed()/waitForRow() poll for up to 90-120s
  // by design (content processing is a genuinely slow async backend job — see
  // the idempotency/concurrency notes on the SEEDS Test Cases Docmost page:
  // https://docmost.a4i-lab.in/s/seeds/p/seeds-test-cases-54bIGOBUUJ). The
  // previous 30s default silently cut those waits short
  // before their own internal timeout logic ever got a chance to run,
  // producing misleading "Test timeout of 30000ms exceeded" failures instead
  // of the real, patient result. Tests that call those methods additionally
  // set their own test.setTimeout() for the full expected budget; this default
  // covers everything else with headroom for a slower remote instance.
  timeout: 60000,
  // Every spec file under e2e/tests logs in as one of a small, shared set of
  // personas (tenant/school/schoolA4I), and auth.spec.js's password-change tests
  // mutate the tenant persona's password mid-run. test.describe.configure({ mode:
  // 'serial' }) inside a file only serializes that file's own tests — it does NOT
  // stop Playwright from running a different file concurrently in another worker.
  // Confirmed live: school.spec.js's tenant login raced auth.spec.js's password
  // mutation window and failed nondeterministically. Forcing a single worker
  // makes every file run strictly one after another, closing that cross-file gap
  // entirely. Revisit if suite runtime becomes a real problem — the fix then is
  // giving password-mutating tests a dedicated, non-shared persona instead of
  // reintroducing parallelism here.
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
