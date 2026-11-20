import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { getInstance } from './fixtures/instances';

const instanceName = process.env.E2E_INSTANCE || 'local';
const instance = getInstance(instanceName);
const appRoot = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
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
          command: 'npm run dev',
          cwd: appRoot,
          url: instance.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        }
      : undefined,
  reporter: [
    ['list'],
    ['json', { outputFile: '../../playwright-report/results.json' }],
    ['html', { open: 'never', outputFolder: '../../playwright-report' }],
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testDir: '.',
    },
  ],
});
