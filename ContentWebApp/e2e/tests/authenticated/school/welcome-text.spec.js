// @ts-check
const { test, expect } = require('@playwright/test');

// TC-AUTH-012: school/admin/me triggers automatically after login, and the header's
// welcome text reflects the response's `name` field. Runs against a reused
// (already-authenticated) storageState — the fresh page load triggers the /me call.

test('TC-AUTH-012 school/admin/me populates the welcome text on /content', async ({ page }) => {
  await page.goto('/content');
  await expect(page.locator('.welcome-text')).toContainText('test-a4i', { timeout: 10000 });
});
