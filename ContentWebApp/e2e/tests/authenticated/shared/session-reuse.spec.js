// @ts-check
// Scaffold verification: confirms auth.setup storageState lets a test start
// already logged in, skipping the login form entirely.
const { test, expect } = require('@playwright/test');

test('reused session lands on /content without submitting the login form', async ({ page }) => {
  await page.goto('/content');
  await expect(page.locator('#login-identifier')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/content');
});
