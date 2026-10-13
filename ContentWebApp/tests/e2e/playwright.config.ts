import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { authFile, getInstance } from './fixtures/instances';

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
      testIgnore: /authenticated\//,
    },
    {
      // Depends on 'chromium' so it always runs after auth.spec.ts's password-change
      // tests restore the tenantPasswordTest persona's password - see auth.spec.ts.
      name: 'setup',
      testDir: './auth',
      testMatch: /auth\.setup\.ts/,
      dependencies: ['chromium'],
    },
    {
      name: 'chromium-tenant-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('tenant') },
      testDir: './authenticated',
      testIgnore: /school\//,
      dependencies: ['setup'],
    },
    {
      name: 'chromium-school-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authFile('school') },
      testDir: './authenticated',
      testIgnore: /tenant\//,
      dependencies: ['setup'],
    },
  ],
});
