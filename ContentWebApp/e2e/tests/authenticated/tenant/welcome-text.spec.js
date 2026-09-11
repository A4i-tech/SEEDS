// @ts-check
const { test, expect } = require('@playwright/test');

// TC-AUTH-005 / TC-AUTH-012: the tenant/me and school/admin/me endpoints trigger
// automatically after login, and the header's welcome text reflects the response's
// `name` field. These run against a reused (already-authenticated) storageState, so a
// fresh page load is what triggers the /me call being verified here.

test('TC-AUTH-005 tenant/me populates the welcome text on /content', async ({ page }) => {
  await page.goto('/content');
  await expect(page.locator('.welcome-text')).toContainText('test-a4i', { timeout: 10000 });
});
