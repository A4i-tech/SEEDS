import { expect, test } from '@playwright/test';

test('TC-ANL-001 tenant can open analytics and see the page header', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('View usage statistics for your tenant.')).toBeVisible({ timeout: 15000 });
});
