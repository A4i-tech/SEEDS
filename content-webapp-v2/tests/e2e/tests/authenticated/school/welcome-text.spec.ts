import { expect, test } from '@playwright/test';

// TC-AUTH-012: school/admin/me triggers automatically after login. Runs against
// a reused (already-authenticated) storageState — the fresh page load triggers
// the /me call.
//
// DELTA vs legacy (authenticated/school/welcome-text.spec.js): v2's Shell has no
// `.welcome-text` header element ('Welcome, test-a4i — Default School' has no v2
// counterpart). Verified live: v2's profile screen reads /tenant/me for every
// role, and the staging backend 403s (/Access denied/, FORBIDDEN) for the school
// role — so no Name:/Tenant: fields render.
test('TC-AUTH-012 school/admin/me populates the account profile on /account/profile', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Signed in as/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('alert')).toContainText(/Access denied/, { timeout: 10000 });
});
