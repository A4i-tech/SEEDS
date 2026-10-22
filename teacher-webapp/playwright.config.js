// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { getInstance, authFile } = require('./e2e/fixtures/instances');

const instanceName = process.env.E2E_INSTANCE || 'dev';
const instance = getInstance(instanceName);

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: instance.baseURL,
    headless: true,
    screenshot: 'on',
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
      dependencies: ['chromium'],
    },
    {
      name: 'chromium-teacher-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('teacher') },
      testDir: './e2e/tests/authenticated',
      dependencies: ['setup'],
    },
  ],
});
