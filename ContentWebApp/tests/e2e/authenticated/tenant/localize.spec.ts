import { expect, test } from '@playwright/test';

test('TC-LOC-001 tenant can open localize and see the add-site action', async ({ page }) => {
  await page.goto('/localize');
  await expect(page.getByRole('heading', { name: 'Localize websites' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Add new site' }).first()).toBeVisible({ timeout: 15000 });
});
