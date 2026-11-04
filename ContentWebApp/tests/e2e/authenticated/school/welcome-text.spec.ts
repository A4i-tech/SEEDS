import { expect, test } from '@playwright/test';

test('TC-AUTH-012 school/admin/me populates the account profile on /account/profile', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Signed in as/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('alert')).toContainText(/Access denied/, { timeout: 10000 });
});
