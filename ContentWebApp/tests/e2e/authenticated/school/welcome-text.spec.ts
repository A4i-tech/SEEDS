import { expect, test } from '@playwright/test';
import { PERSONAS } from '../../fixtures/instances';
import { login } from '../../helpers';

test('TC-AUTH-012 school/admin/me populates the account profile on /account/profile', async ({ page }) => {
  await login(page, PERSONAS.school.identifier, PERSONAS.school.password);
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Signed in as/)).toBeVisible({ timeout: 10000 });
});
