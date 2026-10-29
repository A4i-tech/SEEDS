// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { getInstance, authFile } = require('./e2e/fixtures/instances');

const instanceName = process.env.E2E_INSTANCE || 'dev';
const instance = getInstance(instanceName);

if (!process.env.E2E_TEACHER_PHONE || !process.env.E2E_TEACHER_PASSWORD) {
  throw new Error('E2E_TEACHER_PHONE and E2E_TEACHER_PASSWORD must be set to run teacher-webapp E2E tests');
}

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: instance.baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
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
      name: 'setup',
      testMatch: /e2e\/auth\/auth\.setup\.js/,
    },
    {
      name: 'chromium-teacher-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('teacher') },
      testDir: './e2e/tests/authenticated',
      dependencies: ['setup'],
    },
  ],
});
