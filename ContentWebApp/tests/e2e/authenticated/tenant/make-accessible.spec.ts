import { expect, test } from '@playwright/test';

test('TC-MA-001 tenant can open make accessible and see the upload dropzone', async ({ page }) => {
  await page.goto('/make-accessible');
  await expect(page.getByRole('heading', { name: 'Make Accessible' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Drag files here to upload' })).toBeVisible({ timeout: 15000 });
});
