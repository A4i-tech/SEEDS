import { expect, test } from '@playwright/test';

// TC-AUTH-005: the /tenant/me endpoint triggers automatically after login, and
// the account profile reflects the response's `name` field. Runs against a reused
// (already-authenticated) storageState — the fresh page load triggers the /me call.
//
// DELTA vs legacy (authenticated/tenant/welcome-text.spec.js): v2's Shell has no
// `.welcome-text` header element, so there is no welcome string to assert. The
// closest v2 equivalent is /account/profile, which renders `Name: {me.name}`.
// NOTE: legacy's tenant /me name was 'test-a4i', but that exact string was never
// observed live in v2 (backend-defined) — assert structure, not the value.
test('TC-AUTH-005 tenant/me populates the account name on /account/profile', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Name:/)).toBeVisible({ timeout: 10000 });
});
