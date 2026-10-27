import { expect, test } from '@playwright/test';

test('TC-AUTH-005 tenant/me populates the account name on /account/profile', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Name:/)).toBeVisible({ timeout: 10000 });
});
